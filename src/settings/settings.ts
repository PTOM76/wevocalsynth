import { useCallback, useState } from 'react'
import type { LangSetting } from '../i18n/i18n'
import type { F0Params } from '../dsp/engine'

/** ファイルを開いたときの処理モード。auto は素材から自動判定する */
export type InitialMode = 'auto' | 'vocal' | 'instrument'

/** 配色。system はブラウザ（OS）の設定に合わせる */
export type ThemeSetting = 'system' | 'light' | 'dark'

/** Ctrl+S で行うこと。もう一方は Ctrl+Shift+S になる */
export type CtrlSAction = 'project' | 'export'

/** ピッチ解析で声とみなす判定の厳しさ。ゆるいほど、かすれた声も拾うが、雑音も拾いやすい */
export type F0Voicing = 'strict' | 'normal' | 'loose'

/** ボーカル抽出のモデル（Spleeter 2stems の種類）。fp16 が一番小さい */
export type VocalModel = 'fp16' | 'int8' | 'fp32'

/** 判定の厳しさごとの、有声とみなす谷の深さの上限（Rust 側 `f0::Params::voiced_limit`） */
const VOICED_LIMIT: Record<F0Voicing, number> = { strict: 0.25, normal: 0.35, loose: 0.5 }

/** 設定から F0 解析の設定を作る */
export function f0ParamsFrom(s: Settings): F0Params {
  return {
    minHz: s.f0MinHz,
    maxHz: s.f0MaxHz,
    voicedLimit: VOICED_LIMIT[s.f0Voicing] ?? VOICED_LIMIT.normal,
    silenceRms: 10 ** (s.f0SilenceDb / 20),
  }
}

export interface Settings {
  /** 作業状態を自動保存し、次に開いたとき復元する */
  autoRestore: boolean
  initialMode: InitialMode
  /** 表示言語（auto はブラウザの言語に従う） */
  language: LangSetting
  theme: ThemeSetting
  ctrlS: CtrlSAction
  /** ファイルを開いたときにテンポを自動解析し、BPM・1拍目の位置を入れる */
  autoTempo: boolean
  /** 拍の目安線を波形に出す */
  showBeatGrid: boolean
  /** テンポ（BPM） */
  bpm: number
  /** 1小節の拍数 */
  beatsPerBar: number
  /** 1拍目の位置（秒）。曲の頭に無音があるときに合わせる */
  beatOffset: number
  /** 元に戻せる段数 */
  historyLimit: number
  /** 元に戻す履歴が使うメモリの上限（MB）。超えたら古い段から捨てる */
  historyMemoryMb: number
  /** ピッチ解析: 探す音の範囲（Hz） */
  f0MinHz: number
  f0MaxHz: number
  /** ピッチ解析: 声とみなす判定の厳しさ */
  f0Voicing: F0Voicing
  /** ピッチ解析: これより小さい音量（dB）は無音とみなす */
  f0SilenceDb: number
  /** ボーカル抽出に使うモデル（追加機能） */
  vocalModel: VocalModel
  /** ボーカル抽出で GPU（WebGPU）を使う。使えない環境やモデル（fp16）では CPU（WASM）で動く */
  vocalGpu: boolean
  /** ボーカル抽出で約 11kHz より上を残す（既定は消す。残すと声は明るいが、シンバルなどが混ざりやすい） */
  vocalKeepHighBand: boolean
  /** レベルメーター（全体とトラックごと）を表示する */
  showMeters: boolean
  /** デバッグ表示（FPS など。Ctrl+Shift+D でも切り替え） */
  showDebug: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  autoRestore: true,
  initialMode: 'auto',
  language: 'auto',
  theme: 'system',
  ctrlS: 'project',
  autoTempo: true,
  showBeatGrid: true,
  bpm: 120,
  beatsPerBar: 4,
  beatOffset: 0,
  showDebug: false,
  showMeters: true,
  // int8: CPU でも fp16 より速く、GPU も使える（fp16 は WebGPU で動かない。docs/DECISIONS.md）
  vocalModel: 'int8',
  vocalGpu: true,
  vocalKeepHighBand: false,
  f0MinHz: 60,
  f0MaxHz: 1000,
  f0Voicing: 'normal',
  f0SilenceDb: -50,
  historyLimit: 50,
  historyMemoryMb: 512,
}
const DEFAULTS = DEFAULT_SETTINGS
const STORAGE_KEY = 'wevocalsynth.settings'

/** localStorage から読む。使えない環境（プライベートモードなど）や壊れた値では既定値を使う */
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** アプリの設定（localStorage に保存） */
export function useSettings() {
  const [settings, setState] = useState<Settings>(load)
  const update = useCallback((patch: Partial<Settings>) => {
    setState((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // 保存できなくても、このセッション中は設定を使う
      }
      return next
    })
  }, [])
  return { settings, update }
}
