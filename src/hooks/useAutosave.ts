import { useEffect, useRef } from 'react'
import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import type { Project } from '../project/projectFile'
import { clearAutosave, loadAutosave, saveEdited, saveOriginal } from '../project/autosave'

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
 * - 原音は変わったときだけ保存する。スライダーを動かしただけでは保存しない。パラメータは保存時点の値を入れる
 * - 起動時の復元が終わるまでは保存しない（前回の作業を空の状態で上書きしないため）
 * - 無効にしたら保存済みのデータも消す
 */
export function useAutosave(
  enabled: boolean,
  audio: { fileName: string; original: Clip | null; edited: Clip | null },
  params: EditParams,
  onRestore: (project: Project) => void,
  onError: (e: unknown) => void,
) {
  const restoredRef = useRef(false)
  const savedOriginal = useRef<Clip | null>(null)
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
      .then((p) => {
        if (!p) return
        // 復元した原音は保存済みなので、保存し直さない
        savedOriginal.current = p.original
        latest.current.onRestore(p)
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
    savedOriginal.current = null
    clearAutosave()
  }, [enabled])

  // 音声が変わって落ち着き、ブラウザが空いたら保存する
  const { fileName, original, edited } = audio
  useEffect(() => {
    if (!enabled || !original || !edited || !restoredRef.current) return
    let cancelIdle = () => {}
    const timer = setTimeout(() => {
      cancelIdle = whenIdle(() => {
        try {
          if (savedOriginal.current !== original) {
            saveOriginal(original)
            savedOriginal.current = original
          }
          saveEdited(edited, { fileName, params: latest.current.params })
        } catch (e) {
          latest.current.onError(e)
        }
      })
    }, SAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      cancelIdle()
    }
  }, [enabled, fileName, original, edited])
}
