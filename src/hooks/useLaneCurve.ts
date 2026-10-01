import { useCallback, useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import { clipDuration } from '../audio/types'

/** 帯に描く曲線（音量・フォルマント）のフレーム間隔（秒）。ピッチ（F0_HOP_SEC）と同じ細かさ */
export const CURVE_HOP_SEC = 0.01

/** 曲線の帯の上の点（フレーム `k`、`v` が null なら元に戻す） */
export interface CurvePoint {
  k: number
  v: number | null
}

/**
 * 帯に描いた曲線（音量は dB、フォルマントは半音。`CURVE_HOP_SEC` 間隔、0 は元のまま）。適用で音声に書き込む。
 * 描画中は再レンダーを待たずに同じ配列へ書き込むため、最新値を ref にも持つ（usePitchTarget と同じ）
 */
export function useLaneCurve() {
  const [curve, setCurve] = useState<{ clip: Clip; values: Float32Array } | null>(null)
  const ref = useRef(curve)
  const set = useCallback((c: typeof curve) => {
    ref.current = c
    setCurve(c)
  }, [])

  /** `from` から `to` までを描く（フレーム間は線形補間） */
  const draw = useCallback(
    (clip: Clip, from: CurvePoint, to: CurvePoint) => {
      let values = ref.current?.clip === clip ? ref.current.values : null
      if (!values) {
        values = new Float32Array(Math.ceil(clipDuration(clip) / CURVE_HOP_SEC) + 1)
        set({ clip, values })
      }
      const [a, b] = from.k <= to.k ? [from, to] : [to, from]
      for (let k = Math.max(0, a.k); k <= Math.min(values.length - 1, b.k); k++) {
        if (a.v === null || b.v === null) {
          values[k] = 0
          continue
        }
        const u = b.k === a.k ? 1 : (k - a.k) / (b.k - a.k)
        values[k] = a.v + (b.v - a.v) * u
      }
      // 再描画のきっかけ（中身だけ書き換えたので、同じ配列のまま新しいオブジェクトにする）
      set({ clip, values })
    },
    [set],
  )

  const clear = useCallback(() => set(null), [set])

  return { curve, draw, clear }
}
