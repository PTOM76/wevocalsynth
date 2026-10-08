// 曲線の帯（音量、フォルマント）の縦軸と描画
import { alpha } from '@mui/material'
import type { DrawContext } from './draw'

/** 曲線の帯（音量・フォルマント）の縦軸。上端が `max`、下端が `min`。`ticks` に目盛りを引く */
export interface CurveScale {
  min: number
  max: number
  ticks: number[]
}

/** 音量の帯（dB） */
export const GAIN_SCALE: CurveScale = { min: -24, max: 12, ticks: [12, 6, 0, -6, -12, -24] }
/** フォルマントの帯（半音） */
export const FORMANT_SCALE: CurveScale = { min: -12, max: 12, ticks: [12, 6, 0, -6, -12] }

/** 帯の中の位置 `y`（0〜h）→ 値 / 値 → Canvas の y */
export const curveValueAt = (s: CurveScale, y: number, h: number) => s.max - (Math.min(Math.max(y, 0), h) / h) * (s.max - s.min)
const curveY = (s: CurveScale, v: number, top: number, h: number) => top + ((s.max - v) / (s.max - s.min)) * h

/**
 * 曲線の帯: 目盛りと、描いた曲線（フレーム間隔 `hopSec`、0 は元のまま）。
 * 描いていなければ目盛りだけを出す（0 の線は少し濃く）
 */
export function drawCurveLane(c: DrawContext, top: number, h: number, s: CurveScale, curve: Float32Array | null, hopSec: number) {
  const { g, width, view, pal } = c
  if (h <= 0) return
  g.fillStyle = pal.divider
  g.fillRect(0, top, width, 1)
  for (const v of s.ticks) {
    const y = Math.round(curveY(s, v, top, h))
    g.fillStyle = v === 0 ? alpha(pal.text.secondary, 0.5) : alpha(pal.divider, 0.6)
    g.fillRect(0, y, width, 1)
    g.fillStyle = pal.text.secondary
    if (v !== s.min) g.fillText(`${v > 0 ? '+' : ''}${v}`, 4, y - 6)
  }
  if (!curve) return
  g.strokeStyle = pal.warning.main
  g.lineWidth = 2
  g.beginPath()
  for (let x = 0; x < width; x++) {
    const tt = view.start + (x / width) * view.dur
    const k = Math.min(curve.length - 1, Math.max(0, Math.round(tt / hopSec)))
    const y = curveY(s, curve[k], top, h)
    if (x === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
}
