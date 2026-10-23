// コマンド（操作）の型。メニュー、右クリック、ショートカット、ツールバーが id で参照する（memo/commands.md）
import { commandDefiner, type CommandSpec } from 'pevenmui'
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

/** 1 つの操作（型と使い方は PevenMUI の commands/commands.ts） */
export type Command = CommandSpec<CommandContext, MessageKey>

/** コマンドの集まりを定義する（型を保ったまま返す） */
export const defineCommands = commandDefiner<CommandContext, MessageKey>()

/** 音声を開いているか */
export const opened = (c: CommandContext) => !!c.ed.edited
/** 音声を開いていて、処理中でない */
export const ready = (c: CommandContext) => opened(c) && !c.ed.busy
/** ready で、選択範囲がある */
export const selected = (c: CommandContext) => ready(c) && !!c.ed.selection
