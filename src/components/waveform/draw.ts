import { alpha, type Theme } from '@mui/material'
import type { Clip, Range } from '../../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../../dsp/engine'
import { renderSpectrogram } from './spectrogramImage'
import { hzToMidi, noteName } from '../../audio/notes'

export const WAVE_HEIGHT = 200
export const RULER_HEIGHT = 24
export const PITCH_HEIGHT = 140

export { hzToMidi }

/** 表示範囲（秒） */
export interface View {
  start: number
  dur: number
}

/** ピッチ帯の縦軸（MIDIノート番号の範囲） */
export interface PitchRange {
  lo: number
  hi: number
}

/** ピッチ帯の縦軸。有声部分の範囲に余白を足し、最低1オクターブにする */
export function pitchRange(pitch: Float32Array): PitchRange {
  let lo = Infinity
  let hi = -Infinity
  for (const hz of pitch) {
    if (hz <= 0) continue
    const m = hzToMidi(hz)
    if (m < lo) lo = m
    if (m > hi) hi = m
  }
  if (!Number.isFinite(lo)) return { lo: 48, hi: 72 }
  lo = Math.floor(lo) - 2
  hi = Math.ceil(hi) + 2
  if (hi - lo < 12) {
    const c = (lo + hi) / 2
    lo = Math.floor(c - 6)
    hi = lo + 12
  }
  return { lo, hi }
}

/** 表示範囲について、全チャンネルを通した1ピクセル列ごとの最小値・最大値を求める */
export function computePeaks(clip: Clip, width: number, view: View) {
  const len = clip.channels[0].length
  const sr = clip.sampleRate
  const min = new Float32Array(width)
  const max = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    const a = Math.floor((view.start + (x / width) * view.dur) * sr)
    const b = Math.max(a + 1, Math.floor((view.start + ((x + 1) / width) * view.dur) * sr))
    let lo = 0
    let hi = 0
    for (const ch of clip.channels) {
      for (let i = Math.max(0, a); i < b && i < len; i++) {
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[x] = lo
    max[x] = hi
  }
  return { min, max }
}

/** ラベル間隔が約80px以上になるよう、きりのよい目盛り間隔を選ぶ */
function rulerStep(duration: number, width: number) {
  const target = (duration * 80) / Math.max(width, 1)
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  return steps.find((s) => s >= target) ?? 600
}

/** 描画に共通のコンテキスト */
export interface DrawContext {
  g: CanvasRenderingContext2D
  width: number
  view: View
  pal: Theme['palette']
  dark: boolean
}

const toX = ({ width, view }: DrawContext, t: number) => ((t - view.start) / view.dur) * width

/** 上端の時間目盛り */
export function drawRuler(c: DrawContext) {
  const { g, width, view, pal } = c
  g.fillStyle = pal.text.secondary
  g.strokeStyle = pal.divider
  const step = rulerStep(view.dur, width)
  const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0
  for (let t = Math.ceil(view.start / step) * step; t <= view.start + view.dur; t += step) {
    const x = Math.round(toX(c, t)) + 0.5
    g.beginPath()
    g.moveTo(x, RULER_HEIGHT - 6)
    g.lineTo(x, RULER_HEIGHT)
    g.stroke()
    const m = Math.floor(t / 60)
    const label = m > 0 ? `${m}:${(t - m * 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0')}` : t.toFixed(digits)
    g.fillText(label, x + 3, RULER_HEIGHT / 2 - 2)
  }
  g.beginPath()
  g.moveTo(0, RULER_HEIGHT - 0.5)
  g.lineTo(width, RULER_HEIGHT - 0.5)
  g.stroke()
}

/** 波形の欄にスペクトログラムを描く（解析中はその旨を表示） */
export function drawSpectrogram(c: DrawContext, spec: Spectrogram | null) {
  const { g, width, view, pal } = c
  if (!spec) {
    g.fillStyle = pal.text.secondary
    g.fillText('解析中…', 8, RULER_HEIGHT + WAVE_HEIGHT / 2)
    return
  }
  const off = new OffscreenCanvas(width, WAVE_HEIGHT)
  off.getContext('2d')!.putImageData(renderSpectrogram(spec, width, WAVE_HEIGHT, view.start, view.dur), 0, 0)
  g.drawImage(off, 0, RULER_HEIGHT)
  // 周波数の目盛り
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  const logSpan = Math.log(spec.maxHz / spec.minHz)
  for (const hz of [100, 1000, 10000]) {
    if (hz >= spec.maxHz) continue
    const y = RULER_HEIGHT + WAVE_HEIGHT - (Math.log(hz / spec.minHz) / logSpan) * WAVE_HEIGHT
    g.fillRect(0, Math.round(y), 6, 1)
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
  }
}

/** 選択範囲の塗りと両端の線（高さ `h` まで） */
export function drawSelection(c: DrawContext, selection: Range, h: number) {
  const { g, pal } = c
  const x0 = toX(c, selection.start)
  const x1 = toX(c, selection.end)
  g.fillStyle = alpha(pal.primary.main, 0.16)
  g.fillRect(x0, RULER_HEIGHT, x1 - x0, h - RULER_HEIGHT)
  g.fillStyle = pal.primary.main
  g.fillRect(x0 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
  g.fillRect(x1 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
}

/** 波形（1ピクセル列ごとの最小値〜最大値の縦線）と中央線 */
export function drawWave(c: DrawContext, peaks: { min: Float32Array; max: Float32Array }) {
  const { g, width, pal, dark } = c
  const mid = RULER_HEIGHT + WAVE_HEIGHT / 2
  const amp = WAVE_HEIGHT / 2 - 4
  g.fillStyle = dark ? pal.primary.main : pal.primary.dark
  for (let x = 0; x < width; x++) {
    const y0 = mid - peaks.max[x] * amp
    const y1 = mid - peaks.min[x] * amp
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
  }
  g.fillStyle = pal.divider
  g.fillRect(0, mid, width, 1)
}

/** ピッチ帯: 音名のグリッドと F0 曲線。描いた目標ピッチがあれば元の曲線を薄くして重ねる */
export function drawPitchLane(c: DrawContext, pitch: Float32Array | null, range: PitchRange | null, target: Float32Array | null) {
  const { g, width, view, pal } = c
  const top = RULER_HEIGHT + WAVE_HEIGHT
  g.fillStyle = pal.divider
  g.fillRect(0, top, width, 1)
  if (!pitch || !range) {
    g.fillStyle = pal.text.secondary
    g.fillText('解析中…', 8, top + PITCH_HEIGHT / 2)
    return
  }
  const toY = (m: number) => top + ((range.hi - m) / (range.hi - range.lo)) * PITCH_HEIGHT
  const perSemitone = PITCH_HEIGHT / (range.hi - range.lo)
  for (let m = Math.ceil(range.lo); m <= range.hi; m++) {
    const isC = m % 12 === 0
    if (!isC && perSemitone < 6) continue
    g.fillStyle = isC ? pal.divider : alpha(pal.divider, 0.4)
    g.fillRect(0, Math.round(toY(m)), width, 1)
    if (isC || perSemitone >= 12) {
      g.fillStyle = pal.text.secondary
      g.fillText(noteName(m), 4, toY(m) - 7)
    }
  }

  const k0 = Math.max(0, Math.floor(view.start / F0_HOP_SEC) - 1)
  const k1 = Math.min(pitch.length - 1, Math.ceil((view.start + view.dur) / F0_HOP_SEC) + 1)
  const curve = (data: Float32Array, color: string) => {
    g.strokeStyle = color
    g.beginPath()
    let drawing = false
    for (let k = k0; k <= k1; k++) {
      const hz = data[k]
      if (!(hz > 0)) {
        drawing = false
        continue
      }
      const x = toX(c, k * F0_HOP_SEC)
      const y = toY(hzToMidi(hz))
      if (drawing) g.lineTo(x, y)
      else g.moveTo(x, y)
      drawing = true
    }
    g.stroke()
  }
  g.lineWidth = 2
  g.lineJoin = 'round'
  const edited = !!target && target.some((v) => v > 0)
  curve(pitch, edited ? alpha(pal.secondary.main, 0.4) : pal.secondary.main)
  if (edited) curve(target, pal.primary.main)
  g.lineWidth = 1
}

/** 再生位置の縦線 */
export function drawPlayhead(c: DrawContext, position: number, h: number) {
  c.g.fillStyle = c.pal.text.primary
  c.g.fillRect(Math.round(toX(c, position)) - 1, 0, 2, h)
}
