import { useRef, type RefObject } from 'react'
import type { Range } from '../../audio/types'
import { F0_HOP_SEC } from '../../dsp/engine'
import { hzToMidi } from './draw'
import { noteBlockAt } from '../../audio/noteBlocks'
import { useNoteDrag, type NoteGhost } from './useNoteDrag'

/** 線を掴める距離（px） */
const HIT_PX = 10

interface Lane {
  enabled: boolean
  top: number
  height: number
  /** 帯の上端・下端の音高（MIDI） */
  range: { lo: number; hi: number } | null
  /** 音符ブロックを出しているか（ブロックを掴むと、その音を半音刻みで動かす） */
  notes?: boolean
  /** ピッチの線を出しているか（出していなければ線は掴めない） */
  line?: boolean
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
  timing: {
    duration: number
    secPerPx: () => number
    onGhost: (g: NoteGhost | null) => void
    onRetime: (parts: { start: number; end: number; dur: number }[]) => void
  },
) {
  /** 掴んでいる範囲（フレーム）と、掴んだときの曲線・押した y */
  const grab = useRef<{ k0: number; k1: number; base: Float32Array; y0: number; snap: boolean } | null>(null)

  /** 今表示している線（描いたところは目標、ほかは解析した F0） */
  const shown = (k: number) => (target && target[k] > 0 ? target[k] : (pitch?.[k] ?? 0))

  /** 押した位置にある音符ブロック */
  const hitBlock = (e: React.PointerEvent) => {
    const { range } = lane
    if (!grabMode || !lane.enabled || !lane.notes || !pitch || !range || lane.height <= 0) return null
    const y = e.clientY - canvasRef.current!.getBoundingClientRect().top - lane.top
    const b = noteBlockAt(shown, Math.round(timeAt(e.clientX) / F0_HOP_SEC), pitch.length)
    if (!b) return null
    const per = lane.height / (range.hi - range.lo)
    const by = ((range.hi - b.note - 0.5) / (range.hi - range.lo)) * lane.height
    return y >= by - 2 && y <= by + Math.max(4, per) + 2 ? b : null
  }

  /** 押した位置の近くに線があれば、そのフレーム */
  const hitFrame = (e: React.PointerEvent): number | null => {
    const { range } = lane
    if (!grabMode || !lane.enabled || lane.line === false || !pitch || !range || lane.height <= 0) return null
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

  const note = useNoteDrag(shown, pitch?.length ?? 0, timing.duration, timing.secPerPx, timing.onGhost, timing.onRetime)
  /** ブロックの端の上か */
  const onEdge = (e: React.PointerEvent) => {
    const b = hitBlock(e)
    return !!b && note.partAt(timeAt(e.clientX), b) !== 'body'
  }

  return {
    /** 掴める線の上か（カーソルの形に使う） */
    hover: (e: React.PointerEvent) => hitFrame(e) !== null || hitBlock(e) !== null,
    /** ブロックの端の上か（カーソルを左右の矢印にする） */
    hoverEdge: onEdge,
    /** 掴んでいる途中か */
    grabbing: () => grab.current !== null || note.active(),
    /** 押した位置の線（またはブロック）を掴めたら true */
    down: (e: React.PointerEvent) => {
      // ブロックの端は伸縮、ブロックの中は（線を掴んでいなければ）縦なら音程・横なら移動
      const hb = hitBlock(e)
      const part = hb ? note.partAt(timeAt(e.clientX), hb) : null
      const block = hb && (part !== 'body' || hitFrame(e) === null) ? hb : null
      if (block && part) note.down(e, block, part)
      if (block && part !== 'body') return true
      const k = block ? block.k0 : hitFrame(e)
      if (k === null || !pitch) return false
      let k0: number
      let k1: number
      const t = k * F0_HOP_SEC
      const sel = block ? undefined : selections.find((r) => t >= r.start && t < r.end)
      if (block) {
        k0 = block.k0
        k1 = block.k1
      } else if (sel) {
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
      grab.current = { k0, k1, base, y0: e.clientY, snap: !!block }
      return true
    },
    /** 掴んでいる途中なら動かして true */
    move: (e: React.PointerEvent) => {
      if (note.active() && note.move(e)) return true
      const g = grab.current
      const { range } = lane
      if (!g || !range) return !!g
      let semis = ((g.y0 - e.clientY) / lane.height) * (range.hi - range.lo)
      if (e.shiftKey || g.snap) semis = Math.round(semis)
      const ratio = 2 ** (semis / 12)
      const hz = g.base.slice()
      for (let j = g.k0; j <= g.k1; j++) if (hz[j] > 0) hz[j] *= ratio
      onChange(hz)
      return true
    },
    /** 離す（掴んでいたら true） */
    end: () => {
      const g = grab.current
      grab.current = null
      // 横に動かしたなら、ピッチの変更は捨てる（縦横はどちらか一方）
      const moved = note.end()
      return moved || g !== null
    },
  }
}
