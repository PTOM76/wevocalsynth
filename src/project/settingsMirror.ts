// 設定と画面の状態（localStorage）を、指定したフォルダーにも写す。戻すのは設定の「データ」から（memo/data-folder.md）
import { app } from '../appConfig'
import { mirrorSettings, readMirroredSettings } from './dataFolder'

const PREFIX = app.key('')
/** その場かぎりのもの（抽出のあとに落ちたかの印）は写さない */
const skip = (key: string) => key.includes('extractGuard')

/** このアプリの localStorage の項目 */
function localItems(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX) && !skip(key)) out[key] = localStorage.getItem(key) ?? ''
  } catch {
    // localStorage が使えない環境では写すものがない
  }
  return out
}

let last = ''
/** 前に写したときから変わっていれば写す */
export async function mirrorLocalSettings() {
  const items = localItems()
  const json = JSON.stringify(items)
  if (json === last) return
  await mirrorSettings(items)
  last = json
}

/** 写した設定と画面の状態を localStorage に戻す。戻したら true（そのあと再読み込みする） */
export async function restoreLocalSettings(): Promise<boolean> {
  const items = await readMirroredSettings()
  if (!items) return false
  for (const [key, value] of Object.entries(items)) if (key.startsWith(PREFIX)) localStorage.setItem(key, value)
  last = JSON.stringify(items)
  return true
}
