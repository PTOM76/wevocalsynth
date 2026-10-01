import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import type { Project, ProjectTempo } from './projectFile'
import { idbGet } from './idb'
import { markActivity } from '../debug/debugStats'
import type { AutosaveMessage } from './autosaveWorker'

/**
 * 作業状態の自動保存（IndexedDB）。音声データは localStorage の容量（約5MB）に収まらないため IndexedDB に置く。
 * - .wvsp への変換はせず、Float32Array をそのまま保存する（変換はメインスレッドで数秒かかり画面が固まった）
 * - 書き込みは専用の Worker で行い、メインスレッドの負担は Worker へのコピーだけにする
 * - トラックごとに、原音・加工後を別のキーに置き、変わったものだけを保存し直す（原音はふつう開いたときの1回だけ）
 */
const META_KEY = 'autosave:meta'
const trackKey = (id: string, kind: 'original' | 'edited') => `autosave:track:${id}:${kind}`
/** 以前の形式: トラックが1本だけ（原音・加工後を固定のキーに）と、さらに前の Project を1件で保存していた形式 */
const LEGACY_KEYS = { original: 'autosave:original', edited: 'autosave:edited', project: 'autosave' }

export interface AutosaveMeta {
  fileName: string
  named?: boolean
  params: EditParams
  tempo?: ProjectTempo
  /** トラックの並び。音声は trackKey(id) に置く */
  tracks?: { id: string; name: string; volume?: number; pan?: number; mute?: boolean; solo?: boolean; overlay?: boolean }[]
  active?: number
}

let worker: Worker | null = null
const post = (m: AutosaveMessage, transfer: Transferable[] = []) => {
  worker ??= new Worker(new URL('./autosaveWorker.ts', import.meta.url), { type: 'module' })
  worker.postMessage(m, transfer)
}

/** 1回に送る音声のサンプル数（4MB。複製は 1〜2ms で済む） */
const CHUNK = 1 << 20
/**
 * 送る順番待ち。音声は小分けにして、ブラウザが空いている間に少しずつ送る（まとめて送ると数百MB の複製で画面が止まった）。
 * 並び（meta）や削除も同じ列に入れ、音声より先に届かないようにする
 */
const pending: (() => void)[] = []
let pumping = false
function pump() {
  if (pumping) return
  pumping = true
  const step = (deadline?: IdleDeadline) => {
    const until = performance.now() + 8
    while (pending.length && (deadline ? deadline.timeRemaining() > 1 : performance.now() < until)) pending.shift()!()
    if (!pending.length) {
      pumping = false
      return
    }
    if ('requestIdleCallback' in window) window.requestIdleCallback(step, { timeout: 1000 })
    else setTimeout(() => step(), 16)
  }
  step()
}
const send = (m: AutosaveMessage) => {
  pending.push(() => post(m))
  pump()
}
/** 音声を小分けにして送る */
function sendClip(key: string, clip: Clip) {
  const length = clip.channels[0].length
  pending.push(() => markActivity('autosave'))
  pending.push(() => post({ type: 'begin', key, sampleRate: clip.sampleRate, channels: clip.channels.length, length }))
  clip.channels.forEach((ch, channel) => {
    for (let offset = 0; offset < length; offset += CHUNK) {
      pending.push(() => {
        const data = ch.slice(offset, offset + CHUNK)
        post({ type: 'chunk', key, channel, offset, data }, [data.buffer])
      })
    }
  })
  pending.push(() => post({ type: 'end', key }))
  pump()
}
/** 加工後が原音と同じ（まだ加工していない）ときに、音声の代わりに置く印 */
const SAME_AS_ORIGINAL = { sameAsOriginal: true }

// 開発中のホットリロードで古い Worker が残らないようにする
import.meta.hot?.dispose(() => {
  worker?.terminate()
  worker = null
})

/** トラックの原音か加工後を保存する（変わったものだけ呼ぶ） */
/** `sameAsOriginal` なら、加工後は原音と同じなので音声を送らず印だけ置く（開いた直後は同じ音声を2回送っていた） */
export const saveTrackClip = (id: string, kind: 'original' | 'edited', clip: Clip, sameAsOriginal = false) =>
  sameAsOriginal ? send({ type: 'put', key: trackKey(id, kind), value: SAME_AS_ORIGINAL }) : sendClip(trackKey(id, kind), clip)

/** トラックの並びとパラメータを保存する */
export const saveMeta = (meta: AutosaveMeta) => send({ type: 'put', key: META_KEY, value: meta })

/** なくなったトラックの音声を消す */
export const removeTrackClips = (ids: string[]) => send({ type: 'clear', keys: ids.flatMap((id) => [trackKey(id, 'original'), trackKey(id, 'edited')]) })

/** 保存済みのものをすべて消す */
export async function clearAutosave() {
  const meta = (await idbGet(META_KEY).catch(() => null)) as AutosaveMeta | null
  removeTrackClips((meta?.tracks ?? []).map((t) => t.id))
  send({ type: 'clear', keys: [META_KEY, ...Object.values(LEGACY_KEYS)] })
}

const isClip = (c: unknown): c is Clip => !!c && Array.isArray((c as Clip).channels) && (c as Clip).channels.length > 0

/** 保存済みの作業状態（なければ、または壊れていれば null）。`ids` は各トラックの保存先の ID（保存し直すときに同じキーを使う） */
export async function loadAutosave(): Promise<{ project: Project; ids: string[] } | null> {
  const meta = (await idbGet(META_KEY)) as AutosaveMeta | undefined
  if (meta?.tracks?.length) {
    const tracks = await Promise.all(
      meta.tracks.map(async (t) => ({
        name: t.name,
        volume: t.volume,
        pan: t.pan,
        mute: t.mute,
        solo: t.solo,
        overlay: t.overlay,
        original: await idbGet(trackKey(t.id, 'original')),
        edited: await idbGet(trackKey(t.id, 'edited')),
      })),
    )
    // 加工していないトラックは、加工後に印だけを置いている
    for (const t of tracks) if ((t.edited as typeof SAME_AS_ORIGINAL | undefined)?.sameAsOriginal) t.edited = t.original

    if (!tracks.every((t) => isClip(t.original) && isClip(t.edited))) return null
    return {
      project: { fileName: meta.fileName, named: meta.named, params: meta.params, tempo: meta.tempo, tracks: tracks as Project['tracks'], active: Math.min(meta.active ?? 0, tracks.length - 1) },
      ids: meta.tracks.map((t) => t.id),
    }
  }
  // 以前の形式（トラック1本）
  const [original, edited] = await Promise.all([idbGet(LEGACY_KEYS.original), idbGet(LEGACY_KEYS.edited)])
  if (meta && isClip(original) && isClip(edited)) {
    return { project: { fileName: meta.fileName, params: meta.params, tracks: [{ name: meta.fileName, original, edited }], active: 0 }, ids: [] }
  }
  const legacy = (await idbGet(LEGACY_KEYS.project)) as { fileName: string; params: EditParams; original: Clip; edited: Clip } | undefined
  if (legacy && isClip(legacy.original) && isClip(legacy.edited)) {
    return { project: { fileName: legacy.fileName, params: legacy.params, tracks: [{ name: legacy.fileName, original: legacy.original, edited: legacy.edited }], active: 0 }, ids: [] }
  }
  return null
}
