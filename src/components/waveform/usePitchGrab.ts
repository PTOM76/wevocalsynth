import { useRef, type RefObject } from 'react'
import type { Range } from '../../audio/types'
import { F0_HOP_SEC } from '../../dsp/engine'
import { hzToMidi } from './draw'

/** 線を掴める距離（px） */
const HIT_PX = 10

interface Lane {
  enabled: boolean
  top: number
  height: number
  /** 帯の上端・下端の音高（MIDI） */
  range: { lo: number; hi: number } | null
}

/**
 * ピッチの線を掴んで上下に動かす（掴むモード）。押した位置の近くに線があれば掴み、
 * 押した時刻が選択範囲の中ならその範囲、外なら無声で途切れるまでのひと続きを、ドラッグした分だけ平行に動かす（Shift で半音刻み）。
 * 動かした結果は目標ピッチ（`pitch` と同じ長さ、0 は未編集）として `onChange` に渡す
 */
export function usePitchGrab(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  grabMode: boolean,
  lane: Lane,
  pitch: Float32Array | null,
  target: Float32Array | null,
  selections: Range[],
  timeAt: (clientX: number) => number,
  onChange: (hz: Float32Array) => void,
) {
  /** 掴んでいる範囲（フレーム）と、掴んだときの曲線・押した y */
  const grab = useRef<{ k0: number; k1: number; base: Float32Array; y0: number } | null>(null)

  /** 今表示している線（描いたところは目標、ほかは解析した F0） */
  const shown = (k: number) => (target && target[k] > 0 ? target[k] : (pitch?.[k] ?? 0))

  /** 押した位置の近くに線があれば、そのフレーム */
  const hitFrame = (e: React.PointerEvent): number | null => {
    const { range } = lane
    if (!grabMode || !lane.enabled || !pitch || !range || lane.height <= 0) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top - lane.top
    if (y < 0 || y > lane.height) return null
    const k = Math.round(timeAt(e.clientX) / F0_HOP_SEC)
    // 線は細いので、前後の数フレームも見る
    for (const d of [0, -1, 1, -2, 2, -3, 3]) {
      const j = k + d
      const hz = shown(j)
      if (!(hz > 0)) continue
      const ly = ((range.hi - hzToMidi(hz)) / (range.hi - range.lo)) * lane.height
      if (Math.abs(ly - y) <= HIT_PX) return j
    }
    return null
  }

  return {
    /** 掴める線の上か（カーソルの形に使う） */
    hover: (e: React.PointerEvent) => hitFrame(e) !== null,
    /** 掴んでいる途中か */
    grabbing: () => grab.current !== null,
    /** 押した位置の線を掴めたら true */
    down: (e: React.PointerEvent) => {
      const k = hitFrame(e)
      if (k === null || !pitch) return false
      let k0: number
      let k1: number
      const t = k * F0_HOP_SEC
      const sel = selections.find((r) => t >= r.start && t < r.end)
      if (sel) {
        k0 = Math.max(0, Math.floor(sel.start / F0_HOP_SEC))
        k1 = Math.min(pitch.length - 1, Math.ceil(sel.end / F0_HOP_SEC))
      } else {
        // 無声（線が途切れる所）までのひと続き
        k0 = k
        k1 = k
        while (k0 > 0 && shown(k0 - 1) > 0) k0--
        while (k1 < pitch.length - 1 && shown(k1 + 1) > 0) k1++
      }
      const base = new Float32Array(pitch.length)
      for (let j = 0; j < base.length; j++) base[j] = target?.[j] ?? 0
      // 掴んだ範囲は、まだ描いていないフレームも今の F0 から始める（無声は動かさない）
      for (let j = k0; j <= k1; j++) base[j] = shown(j)
      grab.current = { k0, k1, base, y0: e.clientY }
      return true
    },
    /** 掴んでいる途中なら動かして true */
    move: (e: React.PointerEvent) => {
      const g = grab.current
      const { range } = lane
      if (!g || !range) return !!g
      let semis = ((g.y0 - e.clientY) / lane.height) * (range.hi - range.lo)
      if (e.shiftKey) semis = Math.round(semis)
      const ratio = 2 ** (semis / 12)
      const hz = g.base.slice()
      for (let j = g.k0; j <= g.k1; j++) if (hz[j] > 0) hz[j] *= ratio
      onChange(hz)
      return true
    },
    /** 離す（掴んでいたら true） */
    end: () => {
      const was = grab.current !== null
      grab.current = null
      return was
    },
  }
}
