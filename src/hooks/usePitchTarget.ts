import { useCallback, useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import type { DrawPoint } from '../components/Waveform'

/**
 * ピッチカーブ編集で描いた目標ピッチ（Hz、F0 と同じフレーム、0 は未編集）。
 * 描画中は再レンダーを待たずに同じ配列へ書き込むため、最新値を ref にも持つ。
 */
export function usePitchTarget() {
  const [target, setTargetState] = useState<{ clip: Clip; hz: Float32Array } | null>(null)
  const ref = useRef(target)

  const set = useCallback((t: typeof target) => {
    ref.current = t
    setTargetState(t)
  }, [])

  /** `from` から `to` までを描く（フレーム間は音高を線形補間）。`f0` は `clip` の F0 */
  const draw = useCallback(
    (clip: Clip, f0: Float32Array, from: DrawPoint, to: DrawPoint) => {
      const cur = ref.current
      let hz = cur?.clip === clip ? cur.hz : null
      if (!hz) {
        hz = new Float32Array(f0.length)
        set({ clip, hz })
      }
      const [a, b] = from.k <= to.k ? [from, to] : [to, from]
      for (let k = Math.max(0, a.k); k <= Math.min(hz.length - 1, b.k); k++) {
        if (a.midi === null || b.midi === null) {
          hz[k] = 0
          continue
        }
        // 無声のフレームにはピッチを付けられない
        if (!(f0[k] > 0)) continue
        const g = b.k === a.k ? 1 : (k - a.k) / (b.k - a.k)
        const m = a.midi + (b.midi - a.midi) * g
        hz[k] = 440 * 2 ** ((m - 69) / 12)
      }
    },
    [set],
  )

  const clear = useCallback(() => set(null), [set])

  return { target, draw, clear }
}
