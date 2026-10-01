import { useRef, type RefObject } from 'react'

/** ペンで描ける帯の1本（ピッチ・音量など） */
export interface PenLane<P> {
  /** 描けるか（帯を出していて、描く対象が準備できているか） */
  enabled: boolean
  /** 帯の上端（Canvas の中の y）と高さ */
  top: number
  height: number
  /** 曲線のフレーム間隔（秒） */
  hopSec: number
  /** 帯の中の位置 `y`（0〜height）とフレーム `k` から描く点を作る（Shift・Alt などは `e` から読む） */
  pointAt: (k: number, y: number, e: React.PointerEvent) => P
  /** `from` から `to` までを描く */
  draw: (from: P, to: P) => void
}

/**
 * 帯のペン（押した帯の上をなぞって曲線を描く）。押した帯で描き始め、離すまでその帯に描き続ける
 * （途中で帯の外に出ても、端に貼り付けて描く）。`timeAt` は画面の x 座標から時刻を求める関数。
 * 描いた曲線は配列の中身だけが変わるので、描くたびに `onDrawn` を呼ぶ（描き直しのきっかけにする）
 */
export function useLanePen(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  penMode: boolean,
  timeAt: (clientX: number) => number,
  // 帯ごとの点の型はそれぞれなので、ここでは区別しない
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lanes: PenLane<any>[],
  onDrawn: () => void,
) {
  /** 描いている帯と、直前の点 */
  const active = useRef<{ lane: number; last: unknown } | null>(null)

  const pointFor = (i: number, e: React.PointerEvent) => {
    const lane = lanes[i]
    const rect = canvasRef.current!.getBoundingClientRect()
    const y = Math.min(Math.max(e.clientY - rect.top - lane.top, 0), lane.height)
    const k = Math.round(timeAt(e.clientX) / lane.hopSec)
    return lane.pointAt(k, y, e)
  }
  const drawTo = (i: number, p: unknown) => {
    const a = active.current
    lanes[i].draw(a?.lane === i ? a.last : p, p)
    active.current = { lane: i, last: p }
    onDrawn()
  }

  return {
    /** 描いている途中か */
    drawing: () => active.current !== null,
    /** 押した位置が描ける帯の上なら、描き始めて true */
    down: (e: React.PointerEvent) => {
      if (!penMode) return false
      const rect = canvasRef.current!.getBoundingClientRect()
      const y = e.clientY - rect.top
      const i = lanes.findIndex((l) => l.enabled && l.height > 0 && y >= l.top && y <= l.top + l.height)
      if (i < 0) return false
      active.current = null
      drawTo(i, pointFor(i, e))
      return true
    },
    /** 描いている途中なら続けて描いて true */
    move: (e: React.PointerEvent) => {
      const a = active.current
      if (!a) return false
      drawTo(a.lane, pointFor(a.lane, e))
      return true
    },
    /** 描き終える（描いていたら true） */
    end: () => {
      const was = active.current !== null
      active.current = null
      return was
    },
  }
}
