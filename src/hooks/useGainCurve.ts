import { useCallback, useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import { clipDuration } from '../audio/types'

/** 音量の曲線のフレーム間隔（秒）。ピッチ（F0_HOP_SEC）と同じ細かさ */
export const GAIN_HOP_SEC = 0.01

/** 音量の帯の上の点（フレーム `k`、`db` が null なら元の音量に戻す） */
export interface GainPoint {
  k: number
  db: number | null
}

/**
 * 音量の帯に描いた曲線（dB、`GAIN_HOP_SEC` 間隔、0 は元の音量）。描いたものは再生にすぐ反映し、適用で音声に書き込む。
 * 描画中は再レンダーを待たずに同じ配列へ書き込むため、最新値を ref にも持つ（usePitchTarget と同じ）
 */
export function useGainCurve() {
  const [curve, setCurve] = useState<{ clip: Clip; db: Float32Array } | null>(null)
  const ref = useRef(curve)
  const set = useCallback((c: typeof curve) => {
    ref.current = c
    setCurve(c)
  }, [])

  /** `from` から `to` までを描く（フレーム間は線形補間） */
  const draw = useCallback(
    (clip: Clip, from: GainPoint, to: GainPoint) => {
      let db = ref.current?.clip === clip ? ref.current.db : null
      if (!db) {
        db = new Float32Array(Math.ceil(clipDuration(clip) / GAIN_HOP_SEC) + 1)
        set({ clip, db })
      }
      const [a, b] = from.k <= to.k ? [from, to] : [to, from]
      for (let k = Math.max(0, a.k); k <= Math.min(db.length - 1, b.k); k++) {
        if (a.db === null || b.db === null) {
          db[k] = 0
          continue
        }
        const u = b.k === a.k ? 1 : (k - a.k) / (b.k - a.k)
        db[k] = a.db + (b.db - a.db) * u
      }
      // 再描画のきっかけ（中身だけ書き換えたので、同じ配列のまま新しいオブジェクトにする）
      set({ clip, db })
    },
    [set],
  )

  const clear = useCallback(() => set(null), [set])

  return { curve, draw, clear }
}
