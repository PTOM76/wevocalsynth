// このアプリの IndexedDB。画面（メインスレッド）と自動保存の Worker の両方から使う
import { createIdb } from 'pevenmui/web'

const db = createIdb('wevocalsynth')

export const idbGet = db.get
export const idbPut = db.put
export const idbDelete = db.delete
/** `prefix` で始まるキーをすべて消す（前回の残りの掃除に使う） */
export const idbDeletePrefix = db.deletePrefix
/**
 * 保存したものをすべて消す（設定の「作業データを削除」）。`keep` で始まるキーは残す
 * （開いている作業で退避中の原音。消すと戻せなくなる）
 */
export const idbClear = db.clear
