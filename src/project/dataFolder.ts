// 設定と自動保存した作業を、指定したフォルダーにも写す（PWA を消しても戻せるように。memo/data-folder.md）。画面と自動保存の Worker の両方から使う
import { ADDON_FOLDER_KEY } from 'pevenmui/web'
import { idbGet } from './idb'
import { app } from '../appConfig'

type Dir = FileSystemDirectoryHandle & { queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState> }

/** フォルダーの中に作る、このアプリのデータの置き場所 */
const DATA_DIR = `${app.id}-data`
const AUTOSAVE_DIR = 'autosave'
/** 設定と画面の状態（localStorage の項目をまとめたもの） */
const SETTINGS_FILE = 'settings.json'

/** フォルダーの写しの ID（このブラウザが写してよいかを見分ける。入れ直したブラウザが、空の設定で写しを上書きしないため） */
const ID_FILE = 'id.txt'
/** このブラウザがつながっている写しの ID（localStorage。写しに含まれるので、戻すと同じ ID になる） */
export const LINK_KEY = app.key('dataFolderId')

/** 写す自動保存のキー（作業のメタと、トラックの音声。ウィンドウごとのものも含む） */
export const isMirroredKey = (key: string) => key.startsWith('autosave')

/** 指定したフォルダーのデータの置き場所。選んでいないか、許可がなければ null */
async function dataDir(create: boolean): Promise<Dir | null> {
  const dir = (await idbGet(ADDON_FOLDER_KEY).catch(() => null)) as Dir | null
  if (!dir || (await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) !== 'granted') return null
  return dir.getDirectoryHandle(DATA_DIR, { create }).catch(() => null) as Promise<Dir | null>
}
const autosaveDir = async (create: boolean) => (await dataDir(create))?.getDirectoryHandle(AUTOSAVE_DIR, { create }).catch(() => null) ?? null

// キーはファイル名に使えない文字（: や @）を含むので符号化する。音声は .clip、それ以外は .json
const fileOf = (key: string, clip: boolean) => `${encodeURIComponent(key)}${clip ? '.clip' : '.json'}`
const keyOf = (name: string) => decodeURIComponent(name.replace(/\.(clip|json)$/, ''))

interface StoredClip {
  sampleRate: number
  channels: Float32Array[]
}
const isClip = (v: unknown): v is StoredClip => Array.isArray((v as StoredClip | null)?.channels) && (v as StoredClip).channels.every((c) => c instanceof Float32Array)

/** 音声を 1 つのファイルにする: [見出しの長さ u32][見出しの JSON][各チャンネルの Float32] */
function encodeClip(c: StoredClip): Blob {
  const head = new TextEncoder().encode(JSON.stringify({ sampleRate: c.sampleRate, channels: c.channels.length, length: c.channels[0]?.length ?? 0 }))
  const size = new Uint32Array([head.length])
  return new Blob([size, head, ...c.channels] as BlobPart[])
}
async function decodeClip(file: File): Promise<StoredClip> {
  const buf = await file.arrayBuffer()
  const n = new DataView(buf).getUint32(0, true)
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as { sampleRate: number; channels: number; length: number }
  // Float32Array は 4 バイト境界から始める必要があるので、チャンネルごとに複製する
  let at = 4 + n
  const channels = Array.from({ length: head.channels }, () => {
    const ch = new Float32Array(buf.slice(at, at + head.length * 4))
    at += head.length * 4
    return ch
  })
  return { sampleRate: head.sampleRate, channels }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
  await w.write(data)
  await w.close()
}

/** 自動保存した `key` を写す。フォルダーを使えなければ何もしない */
export async function mirrorPut(key: string, value: unknown) {
  const dir = await autosaveDir(true)
  if (!dir) return
  const clip = isClip(value)
  await writeFile(dir, fileOf(key, clip), clip ? encodeClip(value) : JSON.stringify(value))
  // 種類が変わった（音声 ↔ 原音と同じ印）ときに、前の形のファイルを残さない
  await dir.removeEntry(fileOf(key, !clip)).catch(() => {})
}

/** 写した `keys` を消す */
export async function mirrorDelete(keys: string[]) {
  const dir = await autosaveDir(false)
  if (!dir) return
  for (const key of keys) for (const clip of [true, false]) await dir.removeEntry(fileOf(key, clip)).catch(() => {})
}

/** 写した作業をすべて消す（設定の「作業データを削除」） */
export async function mirrorClearWork() {
  await (await dataDir(false))?.removeEntry(AUTOSAVE_DIR, { recursive: true }).catch(() => {})
}

/** 写した作業を読み出す（`[キー, 値]`。フォルダーを使えなければ空） */
export async function readMirroredWork(): Promise<[string, unknown][]> {
  const dir = await autosaveDir(false)
  if (!dir) return []
  const out: [string, unknown][] = []
  for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (h.kind !== 'file') continue
    const file = await (h as FileSystemFileHandle).getFile()
    out.push([keyOf(name), name.endsWith('.clip') ? await decodeClip(file) : JSON.parse(await file.text())])
  }
  return out
}

/**
 * 指定したフォルダーの写しと、このブラウザの関係。unavailable: 使えない、empty: 写しがない、linked: このブラウザの写し、
 * other: ほかのブラウザ（入れ直す前など）の写し
 */
export async function folderLink(): Promise<'unavailable' | 'empty' | 'linked' | 'other'> {
  const dir = await dataDir(false)
  if (!dir) return (await dataDir(true)) ? 'empty' : 'unavailable'
  const file = await dir.getFileHandle(ID_FILE).then((h) => h.getFile(), () => null)
  if (!file) return 'empty'
  return (await file.text()) === localStorage.getItem(LINK_KEY) ? 'linked' : 'other'
}

/** このブラウザを写しにつなぐ（写しがなければ ID を作る。あれば、それを上書きしてよいことにする） */
export async function linkFolder() {
  const dir = await dataDir(true)
  if (!dir) return
  const file = await dir.getFileHandle(ID_FILE).then((h) => h.getFile(), () => null)
  const id = file ? await file.text() : crypto.randomUUID()
  if (!file) await writeFile(dir, ID_FILE, id)
  localStorage.setItem(LINK_KEY, id)
}

/** 設定と画面の状態を写す */
export async function mirrorSettings(items: Record<string, string>) {
  const dir = await dataDir(true)
  if (dir) await writeFile(dir, SETTINGS_FILE, JSON.stringify(items))
}

/** 写した設定と画面の状態（なければ null） */
export async function readMirroredSettings(): Promise<Record<string, string> | null> {
  const dir = await dataDir(false)
  const file = await dir?.getFileHandle(SETTINGS_FILE).then((h) => h.getFile(), () => null)
  return file ? (JSON.parse(await file.text()) as Record<string, string>) : null
}

/** 写したデータの大きさ（バイト） */
export async function mirroredSize(): Promise<number> {
  const walk = async (dir: FileSystemDirectoryHandle): Promise<number> => {
    let total = 0
    for await (const [, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries())
      total += h.kind === 'file' ? (await (h as FileSystemFileHandle).getFile()).size : await walk(h as FileSystemDirectoryHandle)
    return total
  }
  const dir = await dataDir(false)
  return dir ? walk(dir) : 0
}

/** 写したデータをすべて消す */
export async function mirrorClearAll() {
  const dir = (await idbGet(ADDON_FOLDER_KEY).catch(() => null)) as Dir | null
  if (dir && (await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') await dir.removeEntry(DATA_DIR, { recursive: true }).catch(() => {})
}
