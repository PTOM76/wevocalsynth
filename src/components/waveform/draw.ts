import { beatsIn, type TempoSegment } from '../../audio/tempoMap'
import { alpha, type Theme } from '@mui/material'
import { RULER_HEIGHT, SELECTION_DARK, SELECTION_LIGHT, timeToX, type View, type WaveColors, type WaveDrawContext } from 'wevocal-lib'
import { F0_HOP_SEC } from '../../dsp/engine'
import { renderSpectrogram, type Spectrogram } from '../../audio/spectrogram'
import { hzToMidi, noteName } from '../../audio/notes'
import { noteBlocks } from '../../audio/noteBlocks'
import { markActivity } from '../../debug/debugStats'
import { t } from '../../i18n/i18n'

export { RULER_HEIGHT, SELECTION_LIGHT, SELECTION_DARK }
export { prepareCanvas, drawRuler, drawSelection, drawSelectionHandles, drawGhostWave, drawWave, drawPlayhead, type View } from 'wevocal-lib'
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

/** 描画に共通のコンテキスト（wevocal-lib の波形のものに、Synth の帯を足す） */
export interface DrawContext extends WaveDrawContext {
  pal: Theme['palette']
  dark: boolean
  /** スペクトログラム・ピッチ・音量・フォルマントの帯の高さ（`laneHeights` で決める。出さない帯は 0。波形は `waveH`） */
  specH: number
  pitchH: number
  gainH?: number
  formantH?: number
  /** ピッチを波形に重ねるとき（オーバーパネル）の、ピッチの上端と高さ。なければ自分の帯 */
  pitchY?: number
  pitchLaneH?: number
}

/** スペクトログラム・ピッチの帯の上端 */
const specTop = (c: DrawContext) => RULER_HEIGHT + c.waveH
const pitchTop = (c: DrawContext) => RULER_HEIGHT + c.waveH + c.specH
/** ピッチを描く場所（上端と高さ）。重ねるときは波形の帯 */
const pitchBox = (c: DrawContext): [number, number] => [c.pitchY ?? pitchTop(c), c.pitchLaneH ?? c.pitchH]
export const gainTop = (c: Pick<DrawContext, 'waveH' | 'specH' | 'pitchH'>) => RULER_HEIGHT + c.waveH + c.specH + c.pitchH

/** フォルマントの帯の上端 */
export const formantTop = (c: Pick<DrawContext, 'waveH' | 'specH' | 'pitchH' | 'gainH'>) => gainTop(c) + (c.gainH ?? 0)

const toX = ({ width, view }: DrawContext, t: number) => timeToX(width, view, t)

/** テーマから波形の色を作る。波形は青、再生位置の線は文字色なので、選択範囲はそのどちらとも違うシアンで描き分ける */
export function waveColors(pal: Theme['palette'], dark: boolean): WaveColors {
  return { text: pal.text.primary, textSecondary: pal.text.secondary, divider: pal.divider, wave: pal.primary.main, selection: dark ? SELECTION_DARK : SELECTION_LIGHT }
}

/** 拍の目安線の設定 */
/** 拍の目安線の元（区間ごとのテンポ。`audio/tempoMap.ts`） */
export interface BeatGrid {
  segments: TempoSegment[]
}

/** 拍の目安線。小節の頭は濃く、拍は薄く描く（拍が詰まりすぎる倍率では小節だけ） */
export function drawBeatGrid(c: DrawContext, grid: BeatGrid, h: number) {
  const { g, width, view, pal } = c
  const px = (sec: number) => (sec / view.dur) * width
  for (const b of beatsIn(grid.segments, view.start, view.start + view.dur)) {
    // 拍が詰まりすぎる区間は小節だけ、小節も詰まりすぎるなら描かない
    if (px(b.barSec) < 8 || (!b.bar && px(b.beatSec) < 8)) continue
    const x = Math.round(toX(c, b.time))
    g.fillStyle = alpha(pal.warning.main, b.bar ? 0.5 : 0.2)
    g.fillRect(x, RULER_HEIGHT, 1, h - RULER_HEIGHT)
    if (b.bar && px(b.barSec) >= 24) {
      g.fillStyle = pal.warning.main
      g.fillText(String(b.barNo), x + 3, RULER_HEIGHT - 5)
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
  const { g, pal, waveH, specH, gainH = 0, formantH = 0 } = c
  const [y, h] =
    lane === 'wave' ? [RULER_HEIGHT, waveH] : lane === 'spec' ? [specTop(c), specH] : lane === 'pitch' ? pitchBox(c) : lane === 'gain' ? [gainTop(c), gainH] : [formantTop(c), formantH]
  if (h <= 0) return
  g.fillStyle = pal.primary.main
  g.fillRect(0, y, 3, h)
}

/** ピッチ帯: 音名のグリッドと F0 曲線。描いた目標ピッチがあれば元の曲線を薄くして重ねる */
export function drawPitchLane(c: DrawContext, pitch: Float32Array | null, range: PitchRange | null, target: Float32Array | null, showNotes = false, showLine = true) {
  const { g, width, view, pal } = c
  const [top, pitchH] = pitchBox(c)
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
