import { idbDelete, idbGet, idbPut } from '../project/idb'

/**
 * 追加機能の保存先のフォルダー（試験的。memo/addon-folder.md）。Chrome、Edge の File System Access API。
 * 選んだフォルダーの中の `ADDON_DIR/<id>/<ファイル>` に置き、Service Worker がそこから返す（vite.config.ts）
 */

/** フォルダーのハンドルを残すキー（vite.config.ts の Service Worker と一致させる） */
const KEY = 'addonFolder'
/** 選んだフォルダーの中に作るフォルダー（vite.config.ts と一致させる） */
const ADDON_DIR = 'wevocalsynth-addons'

type Mode = { mode: 'readwrite' }
interface DirHandle {
  name: string
  queryPermission(d: Mode): Promise<PermissionState>
  requestPermission(d: Mode): Promise<PermissionState>
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ getFile(): Promise<File>; createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }> }>
  removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>
}
type DirWindow = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle> }

/** この環境でフォルダーを選べるか */
export const addonFolderSupported = () => typeof window !== 'undefined' && !!(window as DirWindow).showDirectoryPicker

/** 設定がオンか（App が設定から入れる） */
let enabled = false
export function setAddonFolderEnabled(on: boolean) {
  enabled = on
}

/** 選んだフォルダー（なければ null） */
export const savedAddonFolder = async () => ((await idbGet(KEY).catch(() => null)) as DirHandle | null) ?? null

/** フォルダーを選んで残す。選んだフォルダーの名前を返す（やめたら null） */
export async function chooseAddonFolder(): Promise<string | null> {
  const pick = (window as DirWindow).showDirectoryPicker
  if (!pick) return null
  try {
    const dir = await pick.call(window, { id: 'wevocal-addons', mode: 'readwrite' })
    await idbPut(KEY, dir)
    return dir.name
  } catch {
    return null
  }
}

/** 選んだフォルダーを忘れる（中のファイルは消さない） */
export const forgetAddonFolder = () => idbDelete(KEY)

/** フォルダーへのアクセスの状態。選んでいなければ null */
export async function addonFolderPermission(): Promise<PermissionState | null> {
  const dir = await savedAddonFolder()
  return dir ? dir.queryPermission({ mode: 'readwrite' }) : null
}

/** フォルダーへのアクセスの許可を求める（押したボタンの中で呼ぶ） */
export async function requestAddonFolderPermission(): Promise<boolean> {
  const dir = await savedAddonFolder()
  return !!dir && (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** 許可があるときの、追加機能を置くフォルダー（`create` なら作る）。使えなければ null */
async function addonRoot(create: boolean): Promise<DirHandle | null> {
  const dir = await savedAddonFolder()
  if (!dir || (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return null
  return dir.getDirectoryHandle(ADDON_DIR, { create }).catch(() => null)
}

/** 導入でフォルダーを使うか（設定がオンで、フォルダーを選んでいて、許可がある） */
export const installsToFolder = async () => enabled && !!(await addonRoot(true))

/** `id` の追加機能のフォルダー */
const addonDir = async (id: string, create: boolean) => (await addonRoot(create))?.getDirectoryHandle(id, { create }).catch(() => null) ?? null

/** `path`（a/b.wasm）のファイルの、入っているフォルダーと名前 */
async function locate(id: string, path: string, create: boolean): Promise<[DirHandle, string] | null> {
  const parts = path.split('/').filter(Boolean)
  let dir = await addonDir(id, create)
  for (const p of parts.slice(0, -1)) dir = dir ? await dir.getDirectoryHandle(p, { create }).catch(() => null) : null
  return dir ? [dir, parts[parts.length - 1]] : null
}

/** 追加機能のファイルを書き込む */
export async function writeAddonFile(id: string, path: string, data: ArrayBuffer | string) {
  const at = await locate(id, path, true)
  if (!at) throw new Error('追加機能の保存先のフォルダーに書き込めません')
  const w = await (await at[0].getFileHandle(at[1], { create: true })).createWritable()
  await w.write(typeof data === 'string' ? new Blob([data]) : data)
  await w.close()
}

/** 追加機能のファイルを読む（なければ null） */
export async function readAddonFile(id: string, path: string): Promise<File | null> {
  const at = await locate(id, path, false)
  return at ? at[0].getFileHandle(at[1]).then((h) => h.getFile(), () => null) : null
}

/** 追加機能のフォルダーを消す */
export async function removeAddonDir(id: string) {
  await (await addonRoot(false))?.removeEntry(id, { recursive: true }).catch(() => {})
}

/** 追加機能のフォルダーをすべて消す（選んだフォルダーの中の ADDON_DIR だけ） */
export async function clearAddonFolder() {
  const dir = await savedAddonFolder()
  if (dir && (await dir.queryPermission({ mode: 'readwrite' })) === 'granted') await dir.removeEntry(ADDON_DIR, { recursive: true }).catch(() => {})
}
