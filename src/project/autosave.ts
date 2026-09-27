import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import type { Project } from './projectFile'
import { idbGet } from './idb'
import type { AutosaveMessage } from './autosaveWorker'

/**
 * 作業状態の自動保存（IndexedDB）。音声データは localStorage の容量（約5MB）に収まらないため IndexedDB に置く。
 * - .wvsp への変換はせず、Float32Array をそのまま保存する（変換はメインスレッドで数秒かかり画面が固まった）
 * - 書き込みは専用の Worker で行い、メインスレッドの負担は Worker へのコピーだけにする
 * - 原音はファイルを開いたときに1回だけ保存し、以降は加工後の音声とパラメータだけを保存し直す
 */
const KEYS = { meta: 'autosave:meta', original: 'autosave:original', edited: 'autosave:edited' }
/** 以前の形式（Project を1件で保存していた） */
const LEGACY_KEY = 'autosave'

interface Meta {
  fileName: string
  params: EditParams
}

let worker: Worker | null = null
const send = (m: AutosaveMessage) => {
  worker ??= new Worker(new URL('./autosaveWorker.ts', import.meta.url), { type: 'module' })
  worker.postMessage(m)
}

// 開発中のホットリロードで古い Worker が残らないようにする
import.meta.hot?.dispose(() => {
  worker?.terminate()
  worker = null
})

/** 原音を保存する（ファイルを開いたときなど、原音が変わったときだけ） */
export const saveOriginal = (original: Clip) => send({ type: 'put', key: KEYS.original, value: original })

/** 加工後の音声とパラメータを保存する */
export function saveEdited(edited: Clip, meta: Meta) {
  send({ type: 'put', key: KEYS.edited, value: edited })
  send({ type: 'put', key: KEYS.meta, value: meta })
}

export const clearAutosave = () => send({ type: 'clear', keys: [...Object.values(KEYS), LEGACY_KEY] })

const isClip = (c: unknown): c is Clip => !!c && Array.isArray((c as Clip).channels) && (c as Clip).channels.length > 0

/** 保存済みの作業状態（なければ、または壊れていれば null） */
export async function loadAutosave(): Promise<Project | null> {
  const [meta, original, edited] = await Promise.all([idbGet(KEYS.meta), idbGet(KEYS.original), idbGet(KEYS.edited)])
  if (meta && isClip(original) && isClip(edited)) return { ...(meta as Meta), original, edited }
  // 以前の形式
  const legacy = (await idbGet(LEGACY_KEY)) as Project | undefined
  return legacy && isClip(legacy.original) && isClip(legacy.edited) ? legacy : null
}
