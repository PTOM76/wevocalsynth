import { useCallback, useState } from 'react'
import type { Clip } from '../audio/types'

/** 元に戻せる段数 */
const HISTORY_LIMIT = 20

interface History {
  past: Clip[]
  present: Clip | null
  future: Clip[]
}

/** 編集中クリップの履歴（元に戻す / やり直す） */
export function useHistory() {
  const [history, setHistory] = useState<History>({ past: [], present: null, future: [] })

  /** 新しいクリップを履歴に積む */
  const commit = useCallback((clip: Clip) => {
    setHistory((h) => ({
      past: h.present ? [...h.past, h.present].slice(-HISTORY_LIMIT) : h.past,
      present: clip,
      future: [],
    }))
  }, [])

  /** 履歴を捨てて `clip` から始め直す（ファイルを開いたとき） */
  const reset = useCallback((clip: Clip) => setHistory({ past: [], present: clip, future: [] }), [])

  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length && h.present
          ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
          : h,
      ),
    [],
  )

  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length && h.present
          ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
          : h,
      ),
    [],
  )

  return {
    present: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    reset,
    undo,
    redo,
  }
}
