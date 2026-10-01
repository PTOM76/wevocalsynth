import { useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { F0_HOP_SEC } from '../dsp/engine'
import { normalizeRanges } from '../audio/multiRange'
import type { usePitchTarget } from './usePitchTarget'
import { t } from '../i18n/i18n'

interface Deps {
  /** 編集中のクリップと、そのピッチ（解析した F0。無声は 0） */
  edited: Clip | null
  pitch: Float32Array | null
  pitchTarget: ReturnType<typeof usePitchTarget>
  selections: Range[]
  /** 貼り付け先（再生位置） */
  getPosition: () => number
  notify: (message: string) => void
}

/**
 * ピッチの曲線の切り取り・コピー・貼り付け（ピッチの帯にフォーカスしているときの Ctrl+X / C / V）。
 * 結果は目標ピッチの曲線になるので、ほかのピッチの一括操作と同じく試聴してから「適用」で確定する
 */
export function usePitchClipboard(d: Deps) {
  // 覚えたピッチの形（Hz、F0 と同じフレーム間隔、無声は 0）
  const [clipboard, setClipboard] = useState<Float32Array | null>(null)
  const ready = !!d.edited && !!d.pitch
  const hasSel = d.selections.length > 0

  /** 今の目標ピッチ（このクリップのもの）。描いていなければ null */
  const currentTarget = () => (d.pitchTarget.target?.clip === d.edited ? d.pitchTarget.target!.hz : null)
  /** 選択範囲（複数なら最初から最後まで）のフレーム */
  const frames = (): [number, number] | null => {
    if (!d.pitch || !hasSel) return null
    const rs = normalizeRanges(d.selections)
    const k0 = Math.max(0, Math.floor(rs[0].start / F0_HOP_SEC))
    const k1 = Math.min(d.pitch.length - 1, Math.ceil(rs[rs.length - 1].end / F0_HOP_SEC))
    return k1 >= k0 ? [k0, k1] : null
  }

  /** 選択範囲のピッチ（描いた曲線があればそれ、なければ解析したピッチ）を覚える */
  const copy = () => {
    const f = frames()
    if (!f || !d.pitch) return
    const cur = currentTarget()
    const out = new Float32Array(f[1] - f[0] + 1)
    for (let k = f[0]; k <= f[1]; k++) out[k - f[0]] = cur && cur[k] > 0 ? cur[k] : d.pitch[k]
    setClipboard(out)
  }

  /** コピーしたうえで、選択範囲の描いた曲線を消す（元のピッチに戻す） */
  const cut = () => {
    const f = frames()
    if (!f || !d.edited) return
    copy()
    const cur = currentTarget()
    if (!cur) return
    const hz = cur.slice()
    hz.fill(0, f[0], f[1] + 1)
    d.pitchTarget.replace(d.edited, hz)
  }

  /** 再生位置から、覚えたピッチの形を目標の曲線として描く（無声のところには描かない） */
  const paste = () => {
    if (!clipboard || !d.edited || !d.pitch) return
    const f0 = d.pitch
    const at = Math.round(d.getPosition() / F0_HOP_SEC)
    const hz = currentTarget()?.slice() ?? new Float32Array(f0.length)
    let written = 0
    for (let i = 0; i < clipboard.length; i++) {
      const k = at + i
      if (k >= f0.length) break
      if (f0[k] > 0 && clipboard[i] > 0) {
        hz[k] = clipboard[i]
        written++
      }
    }
    if (!written) return d.notify(t('pitchClip.nothing'))
    d.pitchTarget.replace(d.edited, hz)
  }

  return { ready, hasClipboard: !!clipboard, canCut: ready && hasSel, copy, cut, paste, clear: () => setClipboard(null) }
}
