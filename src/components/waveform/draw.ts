import { alpha, type Theme } from '@mui/material'
import type { Range } from '../../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../../dsp/engine'
import { renderSpectrogram } from './spectrogramImage'
import { hzToMidi, noteName } from '../../audio/notes'
import { noteBlocks } from '../../audio/noteBlocks'
import { markActivity } from '../../debug/debugStats'
import { t } from '../../i18n/i18n'

export const RULER_HEIGHT = 24
/** 波形の欄の最低の高さ（画面が低くても、これより小さくしない） */
const MIN_WAVE_HEIGHT = 80

/**
 * Canvas 全体の高さ `total` を、時間軸と帯（上から波形・スペクトログラム・ピッチ・音量・フォルマント）に割り振る。
 * 下の帯（ピッチ・音量・フォルマント）は時間軸を除いた高さの `pitchPercent` %（上の帯が無ければ高さいっぱい）を等分し、
 * 残りを上の帯（波形・スペクトログラム）で等分する
 */
export function laneHeights(total: number, show: { wave: boolean; spec: boolean; pitch: boolean; gain?: boolean; formant?: boolean }, pitchPercent: number) {
  const body = Math.max(MIN_WAVE_HEIGHT, total - RULER_HEIGHT)
  const upper = (show.wave ? 1 : 0) + (show.spec ? 1 : 0)
  const lower = (show.pitch ? 1 : 0) + (show.gain ? 1 : 0) + (show.formant ? 1 : 0)
  const lowerH = lower ? (upper ? Math.round((body * pitchPercent) / 100) : body) : 0
  const pitchH = show.pitch ? Math.round(lowerH / lower) : 0
  const gainH = show.gain ? Math.round(lowerH / lower) : 0
  const each = upper ? (body - lowerH) / upper : 0
  const waveH = show.wave ? Math.round(each) : 0
  return {
    waveH,
    specH: show.spec ? body - lowerH - waveH : 0,
    pitchH,
    gainH: show.formant ? gainH : show.gain ? lowerH - pitchH : 0,
    formantH: show.formant ? lowerH - pitchH - gainH : 0,
    height: RULER_HEIGHT + body,
  }
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
  /** 波形・スペクトログラム・ピッチ・音量・フォルマントの帯の高さ（`laneHeights` で決める。出さない帯は 0） */
  waveH: number
  specH: number
  pitchH: number
  gainH?: number
  formantH?: number
}

/** スペクトログラム・ピッチの帯の上端 */
const specTop = (c: DrawContext) => RULER_HEIGHT + c.waveH
const pitchTop = (c: DrawContext) => RULER_HEIGHT + c.waveH + c.specH
export const gainTop = (c: Pick<DrawContext, 'waveH' | 'specH' | 'pitchH'>) => RULER_HEIGHT + c.waveH + c.specH + c.pitchH

/** フォルマントの帯の上端 */
export const formantTop = (c: Pick<DrawContext, 'waveH' | 'specH' | 'pitchH' | 'gainH'>) => gainTop(c) + (c.gainH ?? 0)

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
export function spectrogramLayer(spec: Spectrogram, width: number, specH: number, view: View) {
  markActivity('spectrogram image')
  // 拡大・スクロールのたびに作り直さず、同じ大きさなら同じ画像の置き場を使い回す（ごみを減らす）
  const w = Math.max(1, width)
  const h = Math.max(1, specH)
  if (!specCanvas || specCanvas.width !== w || specCanvas.height !== h) specCanvas = new OffscreenCanvas(w, h)
  specCanvas.getContext('2d')!.putImageData(renderSpectrogram(spec, w, h, view.start, view.dur), 0, 0)
  return specCanvas
}
let specCanvas: OffscreenCanvas | null = null

/**
 * Canvas の大きさを `w` × `h` にして、描く前の状態（真っさらで、設定も初期値）にする。
 * 大きさが同じなら作り直さずに reset で済ませる（width を代入すると、同じ大きさでも画像の領域を確保し直し、
 * 描き直すたびにメモリの掃除が増えて画面が止まる原因になった）
 */
export function prepareCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const g = canvas.getContext('2d')
  if (canvas.width === w && canvas.height === h && g && 'reset' in g) {
    g.reset()
    return g
  }
  canvas.width = w
  canvas.height = h
  return g
}

/** スペクトログラムの帯を描く（解析中はその旨を表示）。`layer` は `spectrogramLayer` で作った画像 */
export function drawSpectrogram(c: DrawContext, spec: Spectrogram | null, layer: OffscreenCanvas | null) {
  const { g, width, pal, specH } = c
  const top = specTop(c)
  // 上の帯との境目
  g.fillStyle = pal.divider
  g.fillRect(0, top, width, 1)
  if (!spec || !layer) {
    g.fillStyle = pal.text.secondary
    g.fillText(t('common.analyzing'), 8, top + specH / 2)
    return
  }
  g.drawImage(layer, 0, top)
  // 周波数の目盛り
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  const logSpan = Math.log(spec.maxHz / spec.minHz)
  for (const hz of [100, 1000, 10000]) {
    if (hz >= spec.maxHz) continue
    const y = top + specH - (Math.log(hz / spec.minHz) / logSpan) * specH
    g.fillRect(0, Math.round(y), 6, 1)
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
  }
}

/** 帯の種類 */
export type Lane = 'wave' | 'spec' | 'pitch' | 'gain' | 'formant'

/** フォーカスしている帯の左端に色の帯を描く（ツールバーとショートカットがその帯に効くことを示す） */
export function drawLaneFocus(c: DrawContext, lane: Lane) {
  const { g, pal, waveH, specH, pitchH, gainH = 0, formantH = 0 } = c
  const [y, h] =
    lane === 'wave' ? [RULER_HEIGHT, waveH] : lane === 'spec' ? [specTop(c), specH] : lane === 'pitch' ? [pitchTop(c), pitchH] : lane === 'gain' ? [gainTop(c), gainH] : [formantTop(c), formantH]
  if (h <= 0) return
  g.fillStyle = pal.primary.main
  g.fillRect(0, y, 3, h)
}

/** 選択範囲の塗りと両端の線（高さ `h` まで） */
/** 選択範囲の色（ライト / ダーク） */
const SELECTION_LIGHT = '#0097A7'
const SELECTION_DARK = '#4DD0E1'

export function drawSelection(c: DrawContext, selection: Range, h: number) {
  const { g, dark } = c
  const x0 = toX(c, selection.start)
  const x1 = toX(c, selection.end)
  // 波形は青、再生位置の線は文字色なので、選択範囲はそのどちらとも違うシアンで描き分ける
  const color = dark ? SELECTION_DARK : SELECTION_LIGHT
  g.fillStyle = alpha(color, 0.14)
  g.fillRect(x0, RULER_HEIGHT, x1 - x0, h - RULER_HEIGHT)
  g.fillStyle = color
  g.fillRect(x0 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
  g.fillRect(x1 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
}

/** ほかのトラックの波形を、大きな波形の後ろに薄く描く（タイミングを見比べるため。中央線は描かない） */
export function drawGhostWave(c: DrawContext, peaks: { min: Float32Array; max: Float32Array }, scale = 1) {
  const { g, width, pal, waveH } = c
  const mid = RULER_HEIGHT + waveH / 2
  const amp = (waveH / 2 - 4) * scale
  const lim = waveH / 2 - 4
  g.fillStyle = alpha(pal.text.secondary, 0.28)
  for (let x = 0; x < width; x++) {
    const y0 = mid - Math.min(lim, peaks.max[x] * amp)
    const y1 = mid - Math.max(-lim, peaks.min[x] * amp)
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
  }
}

/** 波形（1ピクセル列ごとの最小値〜最大値の縦線）と中央線 */
export function drawWave(c: DrawContext, peaks: { min: Float32Array; max: Float32Array }, scale = 1) {
  const { g, width, pal, waveH } = c
  const mid = RULER_HEIGHT + waveH / 2
  // 縦の拡大（`scale` 倍）。帯からはみ出す分は端で切る
  const amp = (waveH / 2 - 4) * scale
  const lim = waveH / 2 - 4
  // ダークでは primary（明るい水色）のままだとまぶしく、選択範囲の白い線も埋もれるため、少し沈める。
  // ライトでは primary.dark（紺）だと選択範囲の黒い線と見分けにくいため、primary（青）にする
  g.fillStyle = alpha(pal.primary.main, 0.85)
  for (let x = 0; x < width; x++) {
    const y0 = mid - Math.min(lim, peaks.max[x] * amp)
    const y1 = mid - Math.max(-lim, peaks.min[x] * amp)
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
  }
  g.fillStyle = pal.divider
  g.fillRect(0, mid, width, 1)
  if (scale > 1) {
    g.fillStyle = pal.text.secondary
    g.fillText(`×${scale}`, width - 32, RULER_HEIGHT + 12)
  }
}

/** ピッチ帯: 音名のグリッドと F0 曲線。描いた目標ピッチがあれば元の曲線を薄くして重ねる */
export function drawPitchLane(c: DrawContext, pitch: Float32Array | null, range: PitchRange | null, target: Float32Array | null, showNotes = false, showLine = true) {
  const { g, width, view, pal, pitchH } = c
  const top = pitchTop(c)
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
  const edited = !!target && target.some((v) => v > 0)
  if (showNotes) {
    // 音符ブロック: 途切れない有声の区間ごとに、平均に一番近い半音の高さへ横棒を出す
    const at = (k: number) => (edited && target[k] > 0 ? target[k] : pitch[k])
    const fill = alpha(pal.primary.main, 0.45)
    g.strokeStyle = pal.primary.main
    g.lineWidth = 1
    g.fillStyle = fill
    for (const b of noteBlocks(at, k0, k1)) {
      const m = b.note
      const x0 = toX(c, b.k0 * F0_HOP_SEC)
      const x1 = toX(c, (b.k1 + 1) * F0_HOP_SEC)
      const y = toY(m + 0.5)
      const h = Math.max(4, perSemitone)
      g.fillRect(x0, y, Math.max(1, x1 - x0), h)
      g.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, x1 - x0 - 1), h - 1)
      if (x1 - x0 > 28) {
        g.fillStyle = pal.text.primary
        g.fillText(noteName(m), x0 + 2, y - 7)
        g.fillStyle = fill
      }
    }
  }
  if (!showLine) return
  g.lineWidth = 2
  g.lineJoin = 'round'
  curve(pitch, edited ? alpha(pal.secondary.main, 0.4) : pal.secondary.main)
  if (edited) curve(target, pal.primary.main)
  g.lineWidth = 1
}

/** 再生位置の縦線 */
export function drawPlayhead(c: DrawContext, position: number, h: number) {
  c.g.fillStyle = c.pal.text.primary
  c.g.fillRect(Math.round(toX(c, position)) - 1, 0, 2, h)
}
