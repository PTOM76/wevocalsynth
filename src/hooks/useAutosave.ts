import { useEffect, useRef } from 'react'
import type { Clip } from '../audio/types'
import type { Track, TrackFader, TrackMix } from '../audio/tracks'
import type { EditParams } from '../components/EditPanel'
import type { Project } from '../project/projectFile'
import type { ProjectTempo } from '../project/projectFile'
import { clearAutosave, loadAutosave, removeTrackClips, saveMeta, saveTrackClip } from '../project/autosave'

/** 編集が止まってから自動保存するまでの待ち時間（ミリ秒） */
const SAVE_DELAY_MS = 1500
/** フェーダーなど（音声以外）だけが変わったときに、保存するまでの待ち時間（ミリ秒）。動かしている間は書かない */
const META_DELAY_MS = 300
/** ブラウザが空くのを待つ最長時間（ミリ秒）。これを過ぎたら空いていなくても保存する */
const IDLE_TIMEOUT_MS = 5000

/** ブラウザが空いているときに `fn` を呼ぶ（requestIdleCallback がない環境では少し待つだけ） */
function whenIdle(fn: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 200)
  return () => clearTimeout(id)
}

/**
 * 作業状態を IndexedDB に自動保存し、起動時に復元する。
 * - 保存は音声が変わって落ち着き、さらにブラウザが空いているときに、Worker で行う（操作の邪魔をしない）
 * - トラックごとに、原音・加工後のうち変わったものだけを保存し直す。スライダーを動かしただけでは保存しない
 * - フェーダー・ミュート・ソロなど（音声以外）だけが変わったときは、待たずにすぐ保存する
 * - 起動時の復元が終わるまでは保存しない（前回の作業を空の状態で上書きしないため）
 * - 無効にしたら保存済みのデータも消す
 *
 * `onRestore` の `ids` は保存先のトラックの ID。復元したトラックにそのまま使うと、保存し直さずに済む
 */
export function useAutosave(
  enabled: boolean,
  state: { fileName: string; named: boolean; tempo: ProjectTempo; tracks: Track[]; activeId: string; faders: Record<string, TrackFader>; mix: Record<string, TrackMix>; overlay: ReadonlySet<string> },
  params: EditParams,
  onRestore: (project: Project, ids: string[]) => void,
  onError: (e: unknown) => void,
) {
  const restoredRef = useRef(false)
  // 復元を始めたか（開発中の StrictMode は起動時の処理を2回呼ぶので、2回復元しないように）
  const restoringRef = useRef(false)
  /** トラックごとの、保存済みの原音・加工後 */
  const saved = useRef(new Map<string, { original: Clip | null; edited: Clip | null }>())
  const latest = useRef({ params, onRestore, onError })
  latest.current = { params, onRestore, onError }

  // 起動時に1回だけ復元する
  useEffect(() => {
    if (restoredRef.current || restoringRef.current) return
    restoringRef.current = true
    if (!enabled) {
      restoredRef.current = true
      return
    }
    loadAutosave()
      .then((r) => {
        if (!r) return
        // 復元したものは保存済みなので、保存し直さない（以前の形式は ids が空なので保存し直す）
        r.project.tracks.forEach((t, i) => r.ids[i] && saved.current.set(r.ids[i], { original: t.original, edited: t.edited }))
        latest.current.onRestore(r.project, r.ids)
      })
      .catch((e) => latest.current.onError(e))
      .finally(() => {
        restoredRef.current = true
      })
    // 起動時の設定値だけで判断する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 無効にしたら保存済みのデータを消す
  useEffect(() => {
    if (enabled) return
    saved.current.clear()
    void clearAutosave()
  }, [enabled])

  const { fileName, named, tempo, tracks, activeId, faders, mix, overlay } = state
  /** トラックの並びとパラメータ・フェーダー・鳴らし方を保存する（小さいので、すぐ書いてよい） */
  const writeMeta = () =>
    saveMeta({
      fileName,
      named,
      params: latest.current.params,
      tempo,
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        volume: faders[t.id]?.db,
        pan: faders[t.id]?.pan,
        invert: faders[t.id]?.invert,
        mute: mix[t.id]?.mute,
        solo: mix[t.id]?.solo,
        overlay: overlay.has(t.id),
      })),
      active: Math.max(0, tracks.findIndex((t) => t.id === activeId)),
    })
  const writeMetaRef = useRef(writeMeta)
  writeMetaRef.current = writeMeta

  // 音声が変わって落ち着き、ブラウザが空いたら保存する
  useEffect(() => {
    if (!enabled || !tracks.length || !restoredRef.current) return
    let cancelIdle = () => {}
    const timer = setTimeout(() => {
      cancelIdle = whenIdle(() => {
        try {
          for (const t of tracks) {
            const s = saved.current.get(t.id) ?? { original: null, edited: null }
            if (s.original !== t.original) saveTrackClip(t.id, 'original', t.original)
            if (s.edited !== t.clip) saveTrackClip(t.id, 'edited', t.clip, t.clip === t.original)
            saved.current.set(t.id, { original: t.original, edited: t.clip })
          }
          // なくなったトラック（削除・別のファイルを開いた）の音声を消す
          const gone = [...saved.current.keys()].filter((id) => !tracks.some((t) => t.id === id))
          if (gone.length) {
            removeTrackClips(gone)
            gone.forEach((id) => saved.current.delete(id))
          }
          // 音声の後に書く（Worker は届いた順に書くので、並びが音声より先に保存されることはない）
          writeMetaRef.current()
        } catch (e) {
          latest.current.onError(e)
        }
      })
    }, SAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      cancelIdle()
    }
  }, [enabled, tracks])

  // フェーダー・鳴らし方・重ねる表示・選んでいるトラックだけが変わったときは、待たずにすぐ保存する
  // （上の保存は数秒待つので、動かしてすぐ再読み込みすると消えていた）。
  // ただし、どのトラックの音声もまだ保存していないものがあるときは書かない
  // （音声の無いトラックを並びに入れてしまうと、復元できなくなる。上の保存が音声の後に書く）
  useEffect(() => {
    if (!enabled || !tracks.length || !restoredRef.current) return
    const allSaved = tracks.every((t) => {
      const s = saved.current.get(t.id)
      return s && s.original === t.original && s.edited === t.clip
    })
    if (!allSaved) return
    const timer = setTimeout(() => {
      try {
        writeMetaRef.current()
      } catch (e) {
        latest.current.onError(e)
      }
    }, META_DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, tracks, fileName, named, tempo, activeId, faders, mix, overlay])
}
