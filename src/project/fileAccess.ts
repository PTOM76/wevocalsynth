import { downloadBlob } from 'wevocal-lib'
import { idbGet, idbPut } from './idb'

/**
 * ファイルを開く・保存する場所の選択（File System Access API。Chrome・Edge のみ）。
 * 対応していないブラウザ（Firefox・Safari）は、今までどおりファイル選択の input とダウンロードで行う。
 * 保存先の画面はユーザー操作の中でしか出せないので、時間のかかる処理（書き出しのエンコードなど）の前に選ぶ
 */

/** 保存先の画面で最初に開くフォルダ（ブラウザが用意している既定の場所） */
export type StartFolder = 'downloads' | 'documents' | 'desktop' | 'music'

/**
 * ファイル選択の方式（設定の開発者向け）。auto はパソコンだけ File System Access API を使い、スマホやタブレットは input にする
 * （Android では API の選択画面が端末の標準のファイルマネージャーになり、Google ドライブや外部のファイルマネージャーから選べなくなるため）
 */
export type PickerMode = 'auto' | 'api' | 'input'

export interface FileAccessOptions {
  /** 開く・保存するフォルダを、用途ごとにブラウザに覚えさせる */
  rememberFolder: boolean
  startFolder: StartFolder
  /** 最近使用したファイルを記録する */
  recentFiles: boolean
  pickerMode: PickerMode
}

const options: FileAccessOptions = { rememberFolder: true, startFolder: 'downloads', recentFiles: true, pickerMode: 'auto' }

export function configureFileAccess(o: FileAccessOptions) {
  Object.assign(options, o)
}

// TypeScript の標準の型にまだない部分（Chrome・Edge の File System Access API）
interface PickerType {
  description?: string
  accept: Record<string, string[]>
}
interface PickerOptions {
  id?: string
  startIn?: StartFolder
  types?: PickerType[]
}
interface FileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
  isSameEntry(other: FileHandle): Promise<boolean>
  queryPermission(d: { mode: 'read' }): Promise<PermissionState>
  requestPermission(d: { mode: 'read' }): Promise<PermissionState>
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: PickerOptions & { suggestedName?: string }) => Promise<FileHandle>
  showOpenFilePicker?: (o: PickerOptions & { multiple?: boolean }) => Promise<FileHandle[]>
}

/** スマホやタブレットか（iPadOS はパソコンの Safari と同じ名乗りをするので、タッチの点数でも見分ける） */
const isMobile = () => {
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (data?.mobile) return true
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

/** 開く・保存する場所を選ぶ画面（File System Access API）を使うか。ブラウザが対応していて、設定の方式に合うとき */
export const canPickFiles = () => {
  if (typeof window === 'undefined' || !(window as PickerWindow).showSaveFilePicker || options.pickerMode === 'input') return false
  return options.pickerMode === 'api' || !isMobile()
}

/** 用途（`id`）ごとにフォルダを覚えさせる。覚えさせないときは毎回 `startFolder` から始める */
const pickerBase = (id: string): PickerOptions => (options.rememberFolder ? { id, startIn: options.startFolder } : { startIn: options.startFolder })

/** 選んだ保存先。null は選ぶのをやめたとき */
export type SaveTarget = { write: (blob: Blob) => Promise<void> } | null

/**
 * 保存先を選ぶ。`kind` ごとにフォルダを覚える（プロジェクトと音声で別）。
 * `win` は操作したウィンドウ（ダイアログを別ウィンドウで開いているときはそのウィンドウ。ほかのウィンドウからは画面を出せない）。
 * 使えない環境や、ユーザー操作の外で呼ばれて画面を出せなかったときは、ダウンロードで保存する
 */
export async function pickSaveTarget(
  fileName: string,
  kind: 'project' | 'audio',
  type: { description: string; mime: string; ext: string },
  win: Window = window,
): Promise<SaveTarget> {
  const download: SaveTarget = { write: async (blob) => downloadBlob(blob, fileName) }
  const pick = (win as PickerWindow).showSaveFilePicker?.bind(win)
  if (!pick || !canPickFiles()) return download
  try {
    const handle = await pick({ suggestedName: fileName, ...pickerBase(`wevocal-${kind}`), types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }] })
    return {
      write: async (blob) => {
        const w = await handle.createWritable()
        await w.write(blob)
        await w.close()
        // 保存したプロジェクトは、最近使用したファイルから開き直せるようにする（書き出した音声は記録しない）
        if (kind === 'project') void addRecent(handle)
      },
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    return download
  }
}

/**
 * 開くファイルを選ぶ（`exts` は「.wav」のような拡張子）。選んだファイルは最近使用したファイルに記録する。
 * 使えない環境では undefined を返す（呼び出し側で input を使う）。やめたときは null
 */
export async function pickOpenFile(exts: string[], description: string): Promise<File | null | undefined> {
  const pick = (window as PickerWindow).showOpenFilePicker
  if (!pick || !canPickFiles()) return undefined
  try {
    const [handle] = await pick({ ...pickerBase('wevocal-open'), types: [{ description, accept: { 'application/octet-stream': exts } }] })
    const file = await handle.getFile()
    void addRecent(handle)
    return file
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    return undefined
  }
}

/** 最近使用したファイル（新しい順）。ファイルの参照（ハンドル）を IndexedDB に保存する */
export interface RecentFile {
  name: string
  handle: FileHandle
}
const RECENT_KEY = 'recentFiles'
const RECENT_MAX = 8

export async function listRecent(): Promise<RecentFile[]> {
  try {
    const list = await idbGet(RECENT_KEY)
    return Array.isArray(list) ? (list as RecentFile[]) : []
  } catch {
    return []
  }
}

/** OS から渡されたファイル（ダブルクリックで起動したとき）を、最近使用したファイルに記録する */
export const rememberLaunched = (handle: unknown) => void addRecent(handle as FileHandle)

/**
 * ドロップされたファイルを、最近使用したファイルに記録する。ドロップのイベントの中で呼ぶ
 * （ファイルの参照はイベントの間しか取り出せない）。最初の1つだけ記録する
 */
export function rememberDropped(e: DragEvent) {
  // DataTransferItemList は型の設定（DOM.Iterable）によっては反復できないので、Array.from で配列にする
  const item = Array.from(e.dataTransfer?.items ?? []).find((i) => i.kind === 'file') as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<{ kind: string } | null> }) | undefined
  const p = item?.getAsFileSystemHandle?.()
  void p
    ?.then((h) => {
      if (h?.kind === 'file') void addRecent(h as unknown as FileHandle)
    })
    .catch(() => {})
}

/** 先頭に足す。同じファイルが前にあれば、そちらは消す */
async function addRecent(handle: FileHandle) {
  if (!options.recentFiles) return
  const list = await listRecent()
  const rest: RecentFile[] = []
  for (const r of list) if (!(await r.handle.isSameEntry(handle).catch(() => false))) rest.push(r)
  await idbPut(RECENT_KEY, [{ name: handle.name, handle }, ...rest].slice(0, RECENT_MAX)).catch(() => {})
  recentListeners.forEach((f) => f())
}

export async function clearRecent() {
  await idbPut(RECENT_KEY, []).catch(() => {})
  recentListeners.forEach((f) => f())
}

/** 最近使用したファイルを開く。読み込みの許可を求め、読めなければ（消された・移動したなど）一覧から外して null */
export async function openRecent(r: RecentFile): Promise<File | null> {
  try {
    if ((await r.handle.queryPermission({ mode: 'read' })) !== 'granted' && (await r.handle.requestPermission({ mode: 'read' })) !== 'granted') return null
    const file = await r.handle.getFile()
    void addRecent(r.handle)
    return file
  } catch {
    const list = await listRecent()
    const rest: RecentFile[] = []
    for (const x of list) if (!(await x.handle.isSameEntry(r.handle).catch(() => false))) rest.push(x)
    await idbPut(RECENT_KEY, rest).catch(() => {})
    recentListeners.forEach((f) => f())
    return null
  }
}

/** 一覧が変わったことを画面に知らせる */
const recentListeners = new Set<() => void>()
export function onRecentChange(f: () => void) {
  recentListeners.add(f)
  return () => void recentListeners.delete(f)
}
