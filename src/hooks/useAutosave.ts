import { useEffect, useRef } from 'react'
import type { Clip } from '../audio/types'
import type { Track, TrackFader } from '../audio/tracks'
import type { EditParams } from '../components/EditPanel'
import type { Project } from '../project/projectFile'
import { clearAutosave, loadAutosave, removeTrackClips, saveMeta, saveTrackClip } from '../project/autosave'

/** 編集が止まってから自動保存するまでの待ち時間（ミリ秒） */
const SAVE_DELAY_MS = 1500
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
 * - 起動時の復元が終わるまでは保存しない（前回の作業を空の状態で上書きしないため）
 * - 無効にしたら保存済みのデータも消す
 *
 * `onRestore` の `ids` は保存先のトラックの ID。復元したトラックにそのまま使うと、保存し直さずに済む
 */
export function useAutosave(
  enabled: boolean,
  state: { fileName: string; tracks: Track[]; activeId: string; faders: Record<string, TrackFader> },
  params: EditParams,
  onRestore: (project: Project, ids: string[]) => void,
  onError: (e: unknown) => void,
) {
  const restoredRef = useRef(false)
  /** トラックごとの、保存済みの原音・加工後 */
  const saved = useRef(new Map<string, { original: Clip | null; edited: Clip | null }>())
  const latest = useRef({ params, onRestore, onError })
  latest.current = { params, onRestore, onError }

  // 起動時に1回だけ復元する
  useEffect(() => {
    if (restoredRef.current) return
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

  // 音声が変わって落ち着き、ブラウザが空いたら保存する
  const { fileName, tracks, activeId, faders } = state
  useEffect(() => {
    if (!enabled || !tracks.length || !restoredRef.current) return
    let cancelIdle = () => {}
    const timer = setTimeout(() => {
      cancelIdle = whenIdle(() => {
        try {
          for (const t of tracks) {
            const s = saved.current.get(t.id) ?? { original: null, edited: null }
            if (s.original !== t.original) saveTrackClip(t.id, 'original', t.original)
            if (s.edited !== t.clip) saveTrackClip(t.id, 'edited', t.clip)
            saved.current.set(t.id, { original: t.original, edited: t.clip })
          }
          // なくなったトラック（削除・別のファイルを開いた）の音声を消す
          const gone = [...saved.current.keys()].filter((id) => !tracks.some((t) => t.id === id))
          if (gone.length) {
            removeTrackClips(gone)
            gone.forEach((id) => saved.current.delete(id))
          }
          saveMeta({
            fileName,
            params: latest.current.params,
            tracks: tracks.map((t) => ({ id: t.id, name: t.name, volume: faders[t.id]?.db, pan: faders[t.id]?.pan })),
            active: Math.max(0, tracks.findIndex((t) => t.id === activeId)),
          })
        } catch (e) {
          latest.current.onError(e)
        }
      })
    }, SAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      cancelIdle()
    }
  }, [enabled, fileName, tracks, activeId, faders])
}
