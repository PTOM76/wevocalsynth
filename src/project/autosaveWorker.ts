// 自動保存の書き込み専用の Worker。
// IndexedDB への書き込み（数十〜百MB の複製と保存）をメインスレッドから外し、画面の操作を止めないようにする
import { idbDelete, idbPut } from './idb'

/** メインスレッドから送るメッセージ */
export type AutosaveMessage = { type: 'put'; key: string; value: unknown } | { type: 'clear'; keys: string[] }

const scope = self as unknown as Worker

// 書き込みは届いた順に1つずつ行う（同じキーへの書き込みが追い越さないように）
let queue = Promise.resolve()
scope.onmessage = (e: MessageEvent<AutosaveMessage>) => {
  const m = e.data
  queue = queue
    .then(() => (m.type === 'put' ? idbPut(m.key, m.value) : Promise.all(m.keys.map(idbDelete)).then(() => {})))
    .catch((err) => console.warn('autosave failed', err))
}
