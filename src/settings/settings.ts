import { useCallback, useState } from 'react'

/** ファイルを開いたときの処理モード。auto は素材から自動判定する */
export type InitialMode = 'auto' | 'vocal' | 'instrument'

export interface Settings {
  /** 作業状態を自動保存し、次に開いたとき復元する */
  autoRestore: boolean
  initialMode: InitialMode
}

const DEFAULTS: Settings = { autoRestore: true, initialMode: 'auto' }
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
