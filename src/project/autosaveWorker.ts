// 自動保存の書き込み専用の Worker。
// IndexedDB への書き込み（数十〜百MB の複製と保存）をメインスレッドから外し、画面の操作を止めないようにする
import { idbDelete, idbPut } from './idb'

/**
 * メインスレッドから送るメッセージ。音声は大きいので、1回で複製すると画面が止まる。
 * begin → chunk（小分けにした音声。所有権ごと渡すので複製しない）→ end の順に送り、ここで組み立ててから書く
 */
export type AutosaveMessage =
  | { type: 'put'; key: string; value: unknown }
  | { type: 'clear'; keys: string[] }
  | { type: 'begin'; key: string; sampleRate: number; channels: number; length: number }
  | { type: 'chunk'; key: string; channel: number; offset: number; data: Float32Array }
  | { type: 'end'; key: string }

const scope = self as unknown as Worker

/** 組み立て中の音声 */
const building = new Map<string, { sampleRate: number; channels: Float32Array[] }>()

// 書き込みは届いた順に1つずつ行う（同じキーへの書き込みが追い越さないように）
let queue = Promise.resolve()
const write = (op: () => Promise<unknown>) => {
  queue = queue.then(op).then(
    () => {},
    (err) => console.warn('autosave failed', err),
  )
}
scope.onmessage = (e: MessageEvent<AutosaveMessage>) => {
  const m = e.data
  if (m.type === 'begin') building.set(m.key, { sampleRate: m.sampleRate, channels: Array.from({ length: m.channels }, () => new Float32Array(m.length)) })
  else if (m.type === 'chunk') building.get(m.key)?.channels[m.channel].set(m.data, m.offset)
  else if (m.type === 'end') {
    const clip = building.get(m.key)
    building.delete(m.key)
    if (clip) write(() => idbPut(m.key, clip))
  } else if (m.type === 'put') write(() => idbPut(m.key, m.value))
  else write(() => Promise.all(m.keys.map(idbDelete)))
}
