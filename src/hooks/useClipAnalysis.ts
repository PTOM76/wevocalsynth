import { useEffect, useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import { isCancelled } from '../dsp/engine'
import { startJob } from '../progress/jobs'

/**
 * `enabled` の間だけ、`clip` か `key`（解析の設定）が変わるたびに `analyze` を実行して結果を返す（解析中や無効時は null）。
 * 使わない解析（スペクトログラム・F0）を事前に走らせないためのもの。
 * 解析中は、進んでいる処理の一覧（ゲージ）に `label` で出す
 */
export function useClipAnalysis<T>(
  enabled: boolean,
  clip: Clip | null,
  analyze: (clip: Clip) => Promise<T>,
  onError: (e: unknown) => void,
  key = '',
  label = '',
): T | null {
  const [result, setResult] = useState<{ clip: Clip; key: string; data: T } | null>(null)
  const fnRef = useRef({ analyze, onError })
  fnRef.current = { analyze, onError }

  useEffect(() => {
    if (!enabled || !clip || (result?.clip === clip && result.key === key)) return
    let cancelled = false
    const job = label ? startJob('analyze', label) : null
    job?.update(-1)
    fnRef.current
      .analyze(clip)
      .then((data) => !cancelled && setResult({ clip, key, data }))
      .catch((e) => !cancelled && !isCancelled(e) && fnRef.current.onError(e))
      .finally(() => job?.end())
    return () => {
      cancelled = true
      job?.end()
    }
  }, [enabled, clip, key, result, label])

  // 設定を変えて解析し直している間は、前の結果を出したままにする（ピッチ帯が一瞬消えないように）
  return result && result.clip === clip ? result.data : null
}
