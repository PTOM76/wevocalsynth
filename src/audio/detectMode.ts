import type { Clip } from './types'
import { analyzeF0, F0_HOP_SEC, type Algorithm } from '../dsp/engine'

/** 処理モード。ボーカル = 単音向け（既定は SOLA＋フォルマント保持）、楽器 = 和音・打楽器向け（既定は Phase Vocoder） */
export type Mode = 'vocal' | 'instrument'

/** 判定に使う長さ（先頭から、秒） */
const ANALYZE_SEC = 30
/** 音が鳴っているとみなすフレームの RMS（約 -45dB） */
const SOUND_RMS = 0.0056
/** 鳴っているフレームのうち、ピッチが取れた割合がこれ以上ならボーカル（単音）とみなす */
const VOICED_RATIO = 0.4

/**
 * 素材がボーカル（単音）向きか楽器（和音・打楽器）向きかを推定する。
 * 鳴っているフレームのうち F0 が取れた割合を見る。単音の声や楽器はピッチが取れやすく、
 * 和音やドラムは取れにくい。
 */
export async function detectMode(clip: Clip): Promise<{ mode: Mode; voicedRatio: number }> {
  const n = Math.min(clip.channels[0].length, Math.floor(ANALYZE_SEC * clip.sampleRate))
  const channels = clip.channels.map((c) => c.subarray(0, n))
  const f0 = await analyzeF0(channels, clip.sampleRate)

  const hop = Math.round(F0_HOP_SEC * clip.sampleRate)
  let sounding = 0
  let voiced = 0
  for (let k = 0; k < f0.length; k++) {
    // F0 のフレーム k（中心 k × hop）付近の RMS
    const a = Math.max(0, k * hop - hop)
    const b = Math.min(n, k * hop + hop)
    let sum = 0
    for (const c of channels) for (let i = a; i < b; i++) sum += c[i] * c[i]
    const rms = Math.sqrt(sum / Math.max(1, (b - a) * channels.length))
    if (rms < SOUND_RMS) continue
    sounding++
    if (f0[k] > 0) voiced++
  }
  const voicedRatio = sounding ? voiced / sounding : 0
  return { mode: voicedRatio >= VOICED_RATIO ? 'vocal' : 'instrument', voicedRatio }
}

export type ModeSettings = Record<Mode, { algorithm: Algorithm; preserveFormant: boolean }>

/** モードに対応する処理方式とフォルマント保持の既定値（設定の「既定値」で処理方式を変えられる。`modeSettings`） */
export const MODE_SETTINGS: ModeSettings = {
  // ボーカルは SOLA が既定（にじみが少なく、聞き比べて一番自然だった）。PSOLA・WSOLA も処理モードの「…」から選べる
  vocal: { algorithm: 'sola2', preserveFormant: true },
  instrument: { algorithm: 'pv', preserveFormant: false },
}

/** 設定で選んだ処理方式を入れたモードの設定 */
export function modeSettings(s: { vocalAlgorithm: Algorithm; instrumentAlgorithm: Algorithm }): ModeSettings {
  return {
    vocal: { ...MODE_SETTINGS.vocal, algorithm: s.vocalAlgorithm },
    instrument: { ...MODE_SETTINGS.instrument, algorithm: s.instrumentAlgorithm },
  }
}

/** 処理方式から、どちらのモードのボタンを押した状態にするか（どちらの既定でもなければ、Phase Vocoder 系だけ楽器） */
export function modeOf(algorithm: Algorithm, modes: ModeSettings): Mode {
  if (algorithm === modes.vocal.algorithm) return 'vocal'
  if (algorithm === modes.instrument.algorithm) return 'instrument'
  return isInstrumentAlgorithm(algorithm) ? 'instrument' : 'vocal'
}

/** 和音・楽器向けの方式か（Phase Vocoder 系と HPSS。フォルマント保持を既定で切る） */
export function isInstrumentAlgorithm(a: Algorithm) {
  return a === 'pv' || a === 'pv2' || a === 'hpss'
}
