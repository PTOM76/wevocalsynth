import { useRef } from 'react'
import { F0_HOP_SEC } from '../../dsp/engine'
import { noteBlockAt } from '../../audio/noteBlocks'

/** ブロックの端を掴める幅（px） */
const EDGE_PX = 6
/** 縦・横どちらに動かすかを決めるまでの距離（px） */
const LOCK_PX = 4
/** 伸縮で残す区間の最短（秒） */
const MIN_SEC = 0.02

export type NotePart = 'left' | 'right' | 'body'
/** ブロックの時刻（秒）。ドラッグ中の見た目に使う */
export interface NoteGhost {
  start: number
  end: number
  note: number
}
type Seg = { start: number; end: number; dur: number }

interface Drag {
  part: NotePart
  x0: number
  y0: number
  /** body のとき、縦（ピッチ）か横（時刻）か。決まるまで null */
  axis: 'x' | 'y' | null
  start: number
  end: number
  /** 動かせない外側の位置（前・後ろの区間の端） */
  lo: number
  hi: number
  /** 隣の音の端（ここを越えて端を伸ばしたら、伸縮ではなく隣の音のピッチを上書きする） */
  prevEnd: number
  nextStart: number
  note: number
  ghost: NoteGhost | null
}

/**
 * 音符ブロックの時刻の編集（掴むモード）。端をドラッグで伸縮、ブロックを横にドラッグで移動する。
 * 隣のすき間（短ければ隣の音）を伸び縮みさせて、ほかの音の位置と全体の長さは変えない。離したら `onRetime` に区間ごとの新しい長さを渡す
 */
export function useNoteDrag(
  shown: (k: number) => number,
  frames: number,
  duration: number,
  secPerPx: () => number,
  onGhost: (g: NoteGhost | null) => void,
  onRetime: (parts: Seg[]) => void,
  /** フレーム k0〜k1 のピッチを `note` の高さで上書きする */
  onOverwrite: (k0: number, k1: number, note: number) => void,
) {
  const drag = useRef<Drag | null>(null)

  /** フレーム k より前（after=false）・後ろ（true）にある最初のブロック */
  const neighbor = (k: number, after: boolean) => {
    for (let j = k; after ? j < frames : j >= 0; j += after ? 1 : -1) if (shown(j) > 0) return noteBlockAt(shown, j, frames)
    return null
  }

  return {
    /** ブロックのどこを押したか（`x` はブロックの左端・右端からの距離を見るための時刻） */
    partAt: (t: number, block: { k0: number; k1: number }): NotePart => {
      const px = (sec: number) => Math.abs(t - sec) / secPerPx()
      if (px(block.k0 * F0_HOP_SEC) <= EDGE_PX) return 'left'
      if (px((block.k1 + 1) * F0_HOP_SEC) <= EDGE_PX) return 'right'
      return 'body'
    },
    /** ブロックを掴む。body は縦横が決まるまで保留 */
    down: (e: React.PointerEvent, block: { k0: number; k1: number; note: number }, part: NotePart) => {
      const start = block.k0 * F0_HOP_SEC
      const end = (block.k1 + 1) * F0_HOP_SEC
      const prev = neighbor(block.k0 - 1, false)
      const next = neighbor(block.k1 + 1, true)
      const prevEnd = prev ? (prev.k1 + 1) * F0_HOP_SEC : 0
      const nextStart = next ? next.k0 * F0_HOP_SEC : duration
      // すき間が短すぎるときは、隣の音ごと伸び縮みさせる
      const lo = start - prevEnd >= MIN_SEC || !prev ? prevEnd : prev.k0 * F0_HOP_SEC
      const hi = nextStart - end >= MIN_SEC || !next ? nextStart : (next.k1 + 1) * F0_HOP_SEC
      drag.current = { part, x0: e.clientX, y0: e.clientY, axis: part === 'body' ? null : 'x', start, end, lo, hi, prevEnd, nextStart, note: block.note, ghost: null }
    },
    /** 縦（ピッチ）に動かすことに決まったか。決まったら、このあとはピッチの掴みに任せる */
    isVertical: () => drag.current?.axis === 'y',
    active: () => drag.current !== null,
    /** 動かす。横で扱ったら true */
    move: (e: React.PointerEvent): boolean => {
      const d = drag.current
      if (!d) return false
      if (!d.axis) {
        const dx = Math.abs(e.clientX - d.x0)
        const dy = Math.abs(e.clientY - d.y0)
        if (Math.max(dx, dy) < LOCK_PX) return true
        d.axis = dx > dy ? 'x' : 'y'
        if (d.axis === 'y') return false
      }
      if (d.axis === 'y') return false
      const dt = (e.clientX - d.x0) * secPerPx()
      let { start, end } = d
      // 端は隣の音の上まで伸ばせる（その部分はピッチの上書き）
      if (d.part === 'left') start = Math.min(end - MIN_SEC, Math.max(0, start + dt))
      else if (d.part === 'right') end = Math.max(start + MIN_SEC, Math.min(duration, end + dt))
      else {
        const s = Math.min(d.hi - MIN_SEC - (end - start), Math.max(d.lo + MIN_SEC, start + dt))
        end += s - start
        start = s
      }
      d.ghost = { start, end, note: d.note }
      onGhost(d.ghost)
      return true
    },
    /** 離す。掴んでいたら true（横に動かしていたら長さを変える） */
    end: (): boolean => {
      const d = drag.current
      drag.current = null
      if (!d) return false
      onGhost(null)
      const g = d.ghost
      if (d.axis !== 'x' || !g) return true
      // 隣の音にかかったら、かかった所を掴んだ音の高さで上書きする（時間は変えない）
      if (d.part === 'right' && g.end > d.nextStart) {
        onOverwrite(Math.round(d.nextStart / F0_HOP_SEC), Math.round(g.end / F0_HOP_SEC) - 1, d.note)
        return true
      }
      if (d.part === 'left' && g.start < d.prevEnd) {
        onOverwrite(Math.round(g.start / F0_HOP_SEC), Math.round(d.prevEnd / F0_HOP_SEC) - 1, d.note)
        return true
      }
      // 隣の音の手前まで（すき間の中）なら伸縮する
      const s = Math.max(g.start, d.lo + MIN_SEC)
      const en = Math.min(g.end, d.hi - MIN_SEC)
      if (d.part !== 'body') {
        g.start = s
        g.end = en
      }
      onRetime([
        { start: d.lo, end: d.start, dur: g.start - d.lo },
        { start: d.start, end: d.end, dur: g.end - g.start },
        { start: d.end, end: d.hi, dur: d.hi - g.end },
      ])
      return true
    },
  }
}
