// 自動保存の書き込み専用の Worker。
// IndexedDB への書き込み（数十〜百MB の複製と保存）をメインスレッドから外し、画面の操作を止めないようにする
import { idbDelete, idbGet, idbKeys, idbPut } from './idb'
import { isMirroredKey, mirrorDelete, mirrorPut } from './dataFolder'

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
  /** 読み出し（起動時の復元）。音声は所有権ごと返すので、メインスレッドで複製しない */
  | { type: 'get'; key: string; id: number }
  /** 指定したフォルダーにも写すか（設定の「指定したフォルダーに保存する」。dataFolder.ts） */
  | { type: 'folder'; on: boolean }

/** 読み出しの返事 */
export interface AutosaveReply {
  id: number
  value?: unknown
  error?: string
}

const scope = self as unknown as Worker

/** 指定したフォルダーにも写すか */
let mirror = false
/** IndexedDB に書いたあとで、フォルダーにも写す（失敗しても自動保存は止めない） */
const put = async (key: string, value: unknown) => {
  await idbPut(key, value)
  if (mirror && isMirroredKey(key)) await mirrorPut(key, value).catch((err) => console.warn('mirror failed', err))
}

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
  if (m.type === 'folder') {
    const was = mirror
    mirror = m.on
    // オンにしたら、今ある作業をまとめて写す（このあと変わったものは、書くたびに写す）
    if (m.on && !was)
      write(async () => {
        for (const key of await idbKeys('autosave')) await mirrorPut(key, await idbGet(key)).catch((err) => console.warn('mirror failed', err))
      })
    return
  }
  if (m.type === 'get') {
    // 書き込み待ちの後に読む（書いた直後に読んでも古い値にならないように）
    queue = queue.then(async () => {
      try {
        const value = await idbGet(m.key)
        const chans = (value as { channels?: unknown } | undefined)?.channels
        const transfer = Array.isArray(chans) ? chans.filter((c): c is Float32Array => c instanceof Float32Array).map((c) => c.buffer) : []
        scope.postMessage({ id: m.id, value } satisfies AutosaveReply, transfer)
      } catch (err) {
        scope.postMessage({ id: m.id, error: String(err) } satisfies AutosaveReply)
      }
    })
    return
  }
  if (m.type === 'begin') building.set(m.key, { sampleRate: m.sampleRate, channels: Array.from({ length: m.channels }, () => new Float32Array(m.length)) })
  else if (m.type === 'chunk') building.get(m.key)?.channels[m.channel].set(m.data, m.offset)
  else if (m.type === 'end') {
    const clip = building.get(m.key)
    building.delete(m.key)
    if (clip) write(() => put(m.key, clip))
  } else if (m.type === 'put') write(() => put(m.key, m.value))
  else
    write(async () => {
      await Promise.all(m.keys.map(idbDelete))
      if (mirror) await mirrorDelete(m.keys.filter(isMirroredKey)).catch(() => {})
    })
}
