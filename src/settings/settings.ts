// 設定の保存と読み込み、Context
import { createSettingsStore } from 'pevenmui'
import type { F0Params } from '../dsp/engine'
import { DEFAULT_SETTINGS, type Settings } from './items'

/** ファイルを開いたときの処理モード。auto は音声から自動判定する */
export type InitialMode = 'auto' | 'vocal' | 'instrument'

/** 配色。system はブラウザ（OS）の設定に合わせる */
export type ThemeSetting = 'system' | 'light' | 'dark'

/** Ctrl+S で行うこと。もう一方は Ctrl+Shift+S になる */
export type CtrlSAction = 'project' | 'export'

import type { WheelZoom } from 'wevocal-lib/react'
import { app } from '../appConfig'
export type { WheelZoom }
/** 項目の定義は items/ にある。設定を足すときは items/ の分類のファイルに足す */
export { DEFAULT_SETTINGS, type Settings }

/** ピッチ解析で声とみなす判定の厳しさ。ゆるいほど、かすれた声も拾うが、雑音も拾いやすい */
export type F0Voicing = 'strict' | 'normal' | 'loose'

/** ボーカル抽出のモデル。fp16・int8・fp32 は Spleeter、voc-ft・inst-hq4・kara2 は UVR の MDX-Net（extractor/src/mdxModels.ts） */
export type VocalModel = 'fp16' | 'int8' | 'fp32' | 'voc-ft' | 'inst-hq4' | 'kara2'

/** 楽器ごとに分けるモデル。どちらも Demucs（extractor/src/demucsModels.ts）。htdemucs6s はギターとピアノも分ける */
export type StemModel = 'htdemucs' | 'htdemucs6s'

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

// 保存と読み込み、Context は PevenMUI の createSettingsStore（WeVocal Studio と共通）
const store = createSettingsStore<Settings>(app.key('settings'), DEFAULT_SETTINGS)
/** localStorage から読む。使えない環境（プライベートモードなど）や壊れた値では既定値を使う */
export const loadSettings = store.load
/** アプリの設定（localStorage に保存） */
export const useSettings = store.useSettings
/** useSettings() の戻り値 */
export type SettingsStore = ReturnType<typeof useSettings>
/** 設定を、部品とフックから直接読むための Context */
export const SettingsContext = store.SettingsContext
/** 設定を持ち、内側の部品とフックに渡す（main.tsx で App を包む） */
export const SettingsProvider = store.SettingsProvider
/** App の設定を読む（SettingsProvider の中だけで使える） */
export const useAppSettings = store.useAppSettings
