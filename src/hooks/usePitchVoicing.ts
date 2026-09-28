import { useCallback, useMemo, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { F0_HOP_SEC } from '../dsp/engine'
import { hzToMidi, midiToHz } from '../audio/notes'

/** フレームごとの指定: 1 = 有声にする（ピッチを出す）、-1 = 無声にする（ピッチを消す）、0 = 解析のまま */
type Voicing = Int8Array

/**
 * ピッチの強制表示・非表示。解析で無声と判定された範囲にピッチを出したり、
 * 誤って拾ったピッチを消したりする。指定はクリップごとに持ち、編集で新しいクリップになったら消える
 */
export function usePitchVoicing(clip: Clip | null, raw: Float32Array | null) {
  const [state, setState] = useState<{ clip: Clip; v: Voicing } | null>(null)
  const voicing = state && state.clip === clip ? state.v : null

  /** 範囲 `ranges` を有声（1）・無声（-1）・解析のまま（0）にする */
  const set = useCallback(
    (ranges: Range[], value: 1 | -1 | 0) => {
      if (!clip || !raw) return
      const v = voicing ? voicing.slice() : new Int8Array(raw.length)
      for (const r of ranges) {
        const k0 = Math.max(0, Math.floor(r.start / F0_HOP_SEC))
        const k1 = Math.min(raw.length - 1, Math.ceil(r.end / F0_HOP_SEC))
        v.fill(value, k0, k1 + 1)
      }
      setState({ clip, v })
    },
    [clip, raw, voicing],
  )

  const pitch = useMemo(() => (raw && voicing ? applyVoicing(raw, voicing) : raw), [raw, voicing])
  return { pitch, set, hasOverride: !!voicing?.some((x) => x !== 0) }
}

/**
 * 指定を反映した F0 を返す。有声にしたフレームで解析値がなければ、
 * 前後の有声フレームの音高を半音単位で直線補間する（片側しかなければその値を伸ばす）
 */
function applyVoicing(raw: Float32Array, v: Voicing): Float32Array {
  const out = raw.slice()
  for (let k = 0; k < out.length; k++) if (v[k] < 0) out[k] = 0
  for (let k = 0; k < out.length; ) {
    if (!(v[k] > 0 && !(out[k] > 0))) {
      k++
      continue
    }
    // 補う区間 [k, e)
    let e = k
    while (e < out.length && v[e] > 0 && !(out[e] > 0)) e++
    const a = k > 0 && out[k - 1] > 0 ? hzToMidi(out[k - 1]) : null
    const b = e < out.length && out[e] > 0 ? hzToMidi(out[e]) : null
    if (a !== null || b !== null) {
      for (let j = k; j < e; j++) {
        const m = a !== null && b !== null ? a + ((b - a) * (j - k + 1)) / (e - k + 1) : (a ?? b)!
        out[j] = midiToHz(m)
      }
    }
    k = e
  }
  return out
}
