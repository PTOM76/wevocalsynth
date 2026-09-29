import { alpha, type Theme } from '@mui/material'
import type { Range } from '../../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../../dsp/engine'
import { renderSpectrogram } from './spectrogramImage'
import { hzToMidi, noteName } from '../../audio/notes'
import { t } from '../../i18n/i18n'

export const RULER_HEIGHT = 24
/** 波形の欄の最低の高さ（画面が低くても、これより小さくしない） */
const MIN_WAVE_HEIGHT = 80

/** Canvas 全体の高さ `total` を、時間軸・波形・ピッチ帯に割り振る。`pitchPercent` は時間軸を除いた高さに対するピッチ帯の割合 */
export function laneHeights(total: number, showPitch: boolean, pitchPercent: number) {
  const body = Math.max(MIN_WAVE_HEIGHT, total - RULER_HEIGHT)
  const pitchH = showPitch ? Math.round((body * pitchPercent) / 100) : 0
  return { waveH: body - pitchH, pitchH, height: RULER_HEIGHT + body }
}

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
  /** 波形の欄とピッチ帯の高さ（`laneHeights` で決める） */
  waveH: number
  pitchH: number
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

/** 拍の目安線の設定 */
export interface BeatGrid {
  bpm: number
  /** 1小節の拍数 */
  beatsPerBar: number
  /** 1拍目の位置（秒） */
  offset: number
}

/** 拍の目安線。小節の頭は濃く、拍は薄く描く（拍が詰まりすぎる倍率では小節だけ） */
export function drawBeatGrid(c: DrawContext, grid: BeatGrid, h: number) {
  const { g, width, view, pal } = c
  const beat = 60 / grid.bpm
  const pxPerBeat = (beat / view.dur) * width
  const barOnly = pxPerBeat < 8
  if (barOnly && pxPerBeat * grid.beatsPerBar < 8) return
  const first = Math.ceil((view.start - grid.offset) / beat)
  for (let i = first; grid.offset + i * beat <= view.start + view.dur; i++) {
    const isBar = ((i % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0
    if (barOnly && !isBar) continue
    const x = Math.round(toX(c, grid.offset + i * beat))
    g.fillStyle = alpha(pal.warning.main, isBar ? 0.5 : 0.2)
    g.fillRect(x, RULER_HEIGHT, 1, h - RULER_HEIGHT)
    if (isBar && pxPerBeat * grid.beatsPerBar >= 24) {
      g.fillStyle = pal.warning.main
      g.fillText(String(Math.floor(i / grid.beatsPerBar) + 1), x + 3, RULER_HEIGHT - 5)
    }
  }
}

/**
 * 表示範囲のスペクトログラムの画像。作るのが重いため、表示範囲・大きさ・データが変わったときだけ作り、
 * 選択範囲の変更などでの描き直しでは使い回す
 */
export function spectrogramLayer(spec: Spectrogram, width: number, waveH: number, view: View) {
  const off = new OffscreenCanvas(Math.max(1, width), Math.max(1, waveH))
  off.getContext('2d')!.putImageData(renderSpectrogram(spec, width, waveH, view.start, view.dur), 0, 0)
  return off
}

/** 波形の欄にスペクトログラムを描く（解析中はその旨を表示）。`layer` は `spectrogramLayer` で作った画像 */
export function drawSpectrogram(c: DrawContext, spec: Spectrogram | null, layer: OffscreenCanvas | null) {
  const { g, pal, waveH } = c
  if (!spec || !layer) {
    g.fillStyle = pal.text.secondary
    g.fillText(t('common.analyzing'), 8, RULER_HEIGHT + waveH / 2)
    return
  }
  g.drawImage(layer, 0, RULER_HEIGHT)
  // 周波数の目盛り
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  const logSpan = Math.log(spec.maxHz / spec.minHz)
  for (const hz of [100, 1000, 10000]) {
    if (hz >= spec.maxHz) continue
    const y = RULER_HEIGHT + waveH - (Math.log(hz / spec.minHz) / logSpan) * waveH
    g.fillRect(0, Math.round(y), 6, 1)
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
  }
}

/** 選択範囲の塗りと両端の線（高さ `h` まで） */
export function drawSelection(c: DrawContext, selection: Range, h: number) {
  const { g, pal } = c
  const x0 = toX(c, selection.start)
  const x1 = toX(c, selection.end)
  // 波形が primary（青）なので、選択範囲は文字色（ライトは黒、ダークは白）で描き分ける
  g.fillStyle = alpha(pal.text.primary, 0.1)
  g.fillRect(x0, RULER_HEIGHT, x1 - x0, h - RULER_HEIGHT)
  g.fillStyle = pal.text.primary
  g.fillRect(x0 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
  g.fillRect(x1 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
}

/** 波形（1ピクセル列ごとの最小値〜最大値の縦線）と中央線 */
export function drawWave(c: DrawContext, peaks: { min: Float32Array; max: Float32Array }) {
  const { g, width, pal, waveH } = c
  const mid = RULER_HEIGHT + waveH / 2
  const amp = waveH / 2 - 4
  // ダークでは primary（明るい水色）のままだとまぶしく、選択範囲の白い線も埋もれるため、少し沈める。
  // ライトでは primary.dark（紺）だと選択範囲の黒い線と見分けにくいため、primary（青）にする
  g.fillStyle = alpha(pal.primary.main, 0.85)
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
  const { g, width, view, pal, waveH, pitchH } = c
  const top = RULER_HEIGHT + waveH
  g.fillStyle = pal.divider
  g.fillRect(0, top, width, 1)
  if (!pitch || !range) {
    g.fillStyle = pal.text.secondary
    g.fillText(t('common.analyzing'), 8, top + pitchH / 2)
    return
  }
  const toY = (m: number) => top + ((range.hi - m) / (range.hi - range.lo)) * pitchH
  const perSemitone = pitchH / (range.hi - range.lo)
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
