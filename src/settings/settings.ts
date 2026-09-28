import { useCallback, useState } from 'react'
import type { LangSetting } from '../i18n/i18n'

/** ファイルを開いたときの処理モード。auto は素材から自動判定する */
export type InitialMode = 'auto' | 'vocal' | 'instrument'

/** 配色。system はブラウザ（OS）の設定に合わせる */
export type ThemeSetting = 'system' | 'light' | 'dark'

/** Ctrl+S で行うこと。もう一方は Ctrl+Shift+S になる */
export type CtrlSAction = 'project' | 'export'

export interface Settings {
  /** 作業状態を自動保存し、次に開いたとき復元する */
  autoRestore: boolean
  initialMode: InitialMode
  /** 表示言語（auto はブラウザの言語に従う） */
  language: LangSetting
  theme: ThemeSetting
  ctrlS: CtrlSAction
  /** 拍の目安線を波形に出す */
  showBeatGrid: boolean
  /** テンポ（BPM） */
  bpm: number
  /** 1小節の拍数 */
  beatsPerBar: number
  /** 1拍目の位置（秒）。曲の頭に無音があるときに合わせる */
  beatOffset: number
  /** デバッグ表示（FPS など。Ctrl+Shift+D でも切り替え） */
  showDebug: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  autoRestore: true,
  initialMode: 'auto',
  language: 'auto',
  theme: 'system',
  ctrlS: 'project',
  showBeatGrid: true,
  bpm: 120,
  beatsPerBar: 4,
  beatOffset: 0,
  showDebug: false,
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
