// コマンド（操作）の型。メニュー、右クリック、ショートカット、ツールバーが id で参照する（memo/commands.md）
import type { useWaveformView } from 'wevocal-lib/react'
import type { useTrackArea } from '../components/tracks/useTrackArea'
import type { MessageKey } from '../i18n/i18n'
import type { Dialogs } from '../hooks/useDialogs'
import type { useEditor } from '../hooks/useEditor'
import type { useSelectionExport } from '../hooks/useSelectionExport'
import type { Settings } from '../settings/settings'

/** 波形の表示範囲と縦の拡大率（App が持つ） */
export interface AppView {
  ctl: ReturnType<typeof useWaveformView>
  /** 表示範囲の真ん中（秒） */
  center: number
  waveScale: number
  setWaveScale: (scale: number) => void
}

/** コマンドが読む今の状態（App が毎回の描画で作る。役割ごとの窓口だけを渡す） */
export interface CommandContext {
  ed: ReturnType<typeof useEditor>
  dialogs: Dialogs
  settings: Settings
  update: (patch: Partial<Settings>) => void
  view: AppView
  trackArea: ReturnType<typeof useTrackArea>
  selectionExport: ReturnType<typeof useSelectionExport>
}

type T = (key: MessageKey, vars?: Record<string, string | number>) => string

/** 1 つの操作 */
export interface Command {
  /** 名前（状態で変わるなら関数） */
  label: MessageKey | ((c: CommandContext, t: T) => string)
  /** キーの割り当てのない操作で、メニューの右に表示する操作（ホイールなど） */
  hint?: (c: CommandContext) => string
  /** 表示するか（省くといつも表示する。使えない環境や、試験的機能の設定がオフのときに隠す） */
  visible?: (c: CommandContext) => boolean
  /** 押せるか（省くといつも押せる） */
  enabled?: (c: CommandContext) => boolean
  /** オンとオフの操作なら、今オンか */
  checked?: (c: CommandContext) => boolean
  run: (c: CommandContext) => void
  /** 押せないときはキーを受け取らない（ブラウザやほかの部品に任せる）。省くと、キーはいつも受け取り、押せないときは何もしない */
  keyOnlyWhenEnabled?: boolean
}

/** コマンドの集まりを定義する（型を保ったまま返す） */
export const defineCommands = <T extends Record<string, Command>>(commands: T) => commands

/** 音声を開いているか */
export const opened = (c: CommandContext) => !!c.ed.edited
/** 音声を開いていて、処理中でない */
export const ready = (c: CommandContext) => opened(c) && !c.ed.busy
/** ready で、選択範囲がある */
export const selected = (c: CommandContext) => ready(c) && !!c.ed.selection
