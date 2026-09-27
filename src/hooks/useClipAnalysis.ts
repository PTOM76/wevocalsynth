import { useEffect, useRef, useState } from 'react'
import type { Clip } from '../audio/types'

/**
 * `enabled` の間だけ、`clip` が変わるたびに `analyze` を実行して結果を返す（解析中や無効時は null）。
 * 使わない解析（スペクトログラム・F0）を事前に走らせないためのもの。
 */
export function useClipAnalysis<T>(
  enabled: boolean,
  clip: Clip | null,
  analyze: (clip: Clip) => Promise<T>,
  onError: (e: unknown) => void,
): T | null {
  const [result, setResult] = useState<{ clip: Clip; data: T } | null>(null)
  const fnRef = useRef({ analyze, onError })
  fnRef.current = { analyze, onError }

  useEffect(() => {
    if (!enabled || !clip || result?.clip === clip) return
    let cancelled = false
    fnRef.current
      .analyze(clip)
      .then((data) => !cancelled && setResult({ clip, data }))
      .catch((e) => !cancelled && fnRef.current.onError(e))
    return () => {
      cancelled = true
    }
  }, [enabled, clip, result])

  return result && result.clip === clip ? result.data : null
}
