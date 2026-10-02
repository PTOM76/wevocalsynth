import { useCallback, useState } from 'react'
import type { LangSetting } from '../i18n/i18n'
import type { Algorithm, F0Params } from '../dsp/engine'
import type { WindowMode } from 'pevenmui'

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
  /** 再生中、再生位置が画面の外に出たら表示範囲を追従させる（ツールバーのボタンで切り替える） */
  followPlayhead: boolean
  /** 加工・音量のスライダーをダブルクリックで既定値に戻す（誤って戻すのが気になる人は切れる） */
  sliderDoubleClickReset: boolean
  /** 範囲をドラッグしている途中も、選択範囲の数値などを更新する（切ると離したときに更新。軽い） */
  liveSelection: boolean
  /** レベルメーター（全体とトラックごと）を表示する */
  showMeters: boolean
  /** ピッチ帯に音符ブロック（音ごとの半音の高さ）を出す */
  showNotes: boolean
  /** ピッチ帯にピッチの線を出す（音符ブロックとどちらかは出す） */
  showPitchLine: boolean
  /** 貼り付け・無音の挿入のあと、再生位置を入れた範囲の終わりへ移す */
  seekAfterInsert: boolean
  /** デバッグ表示（FPS など。Ctrl+Shift+D でも切り替え） */
  showDebug: boolean
  /** ボーカル・楽器のモードで使う処理方式 */
  vocalAlgorithm: Algorithm
  instrumentAlgorithm: Algorithm
  /** テンポを自動解析しないとき（設定で切ったときなど）の BPM */
  defaultBpm: number
  /** BPM を手で変えたら、全トラックをそのテンポに合わせて伸縮する（ピッチは変えない） */
  tempoStretch: boolean
  /** 継ぎ目（範囲の差し戻し・貼り付け・切り取り）のクロスフェード長（ms）。聴き比べて既定を決めるため開発者向けに置く */
  spliceFadeMs: number
  /** ループ試聴で、断片の読み始めを前の断片とそろえる（位置合わせ）。切ると従来の方式 */
  realtimeAlign: boolean
  /** フォルマント補正で速い対数・指数の近似を使う（切ると標準の関数。聴き比べ用） */
  fastMath: boolean
  /** ダイアログの出し方（今は設定画面のみ）。auto は PWA かつ Chromium 系ならポップアップ、ほかはダイアログ。別窓を開けなければダイアログ */
  dialogWindow: WindowMode | 'auto'
  /** 止めている間は AudioContext を一時停止する（iOS で音が出ないときの切り分け用。`audio/audioContext.ts`） */
  suspendWhenStopped: boolean
  /** iOS のオーディオセッションを playback にする（消音スイッチでも鳴る） */
  playbackSession: boolean
  /** 従来の処理方式（改良版があるもの）も選べるように表示する */
  showLegacyAlgorithms: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  autoRestore: true,
  initialMode: 'auto',
  language: 'auto',
  theme: 'system',
  ctrlS: 'project',
  autoTempo: true,
  showBeatGrid: true,
  showDebug: false,
  showMeters: true,
  showNotes: false,
  showPitchLine: true,
  seekAfterInsert: true,
  liveSelection: false,
  followPlayhead: true,
  sliderDoubleClickReset: true,
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
  dialogWindow: 'auto',
  suspendWhenStopped: true,
  playbackSession: true,
  showLegacyAlgorithms: false,
  vocalAlgorithm: 'sola2',
  instrumentAlgorithm: 'pv',
  defaultBpm: 120,
  tempoStretch: false,
  spliceFadeMs: 5,
  realtimeAlign: true,
  fastMath: true,
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
