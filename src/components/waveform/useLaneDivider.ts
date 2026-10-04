import { localPoint } from 'pevenmui'
import { useRef, type PointerEvent, type RefObject } from 'react'
import { RULER_HEIGHT } from './draw'

/** 境目をつかめる距離（px） */
const GRAB_PX = 4
/** ピッチ帯の割合（%）の範囲 */
export const PITCH_PERCENT_MIN = 20
export const PITCH_PERCENT_MAX = 80

/**
 * 波形の欄とピッチ帯の境目のドラッグ。ピッチ帯の割合（時間軸を除いた高さに対する %）を変える。
 * 波形とピッチの操作が画面の主役なので、見たい方を広く取れるようにする
 */
export function useLaneDivider(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  lanes: { waveH: number; pitchH: number },
  enabled: boolean,
  onChange: (percent: number) => void,
) {
  const dragging = useRef(false)
  const yOf = (e: PointerEvent) => localPoint(canvasRef.current!, e.clientX, e.clientY).y

  /** `e` の位置が境目の上か */
  const hit = (e: PointerEvent) => enabled && Math.abs(yOf(e) - (RULER_HEIGHT + lanes.waveH)) <= GRAB_PX

  return {
    hit,
    dragging: () => dragging.current,
    /** 境目の上で押されたらドラッグを始めて true を返す */
    start: (e: PointerEvent) => {
      if (!hit(e)) return false
      dragging.current = true
      return true
    },
    move: (e: PointerEvent) => {
      const body = lanes.waveH + lanes.pitchH
      const pitch = RULER_HEIGHT + body - yOf(e)
      const percent = Math.round((pitch / body) * 100)
      onChange(Math.min(PITCH_PERCENT_MAX, Math.max(PITCH_PERCENT_MIN, percent)))
    },
    end: () => {
      dragging.current = false
    },
  }
}
