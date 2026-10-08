// コマンド（操作）の型。メニュー、右クリック、ショートカット、ツールバーが id で参照する（memo/commands.md）
import type { MessageKey } from '../i18n/i18n'
import type { Dialogs } from '../hooks/useDialogs'
import type { useEditor } from '../hooks/useEditor'

/** コマンドが読む今の状態（App が毎回の描画で作る） */
export interface CommandContext {
  ed: ReturnType<typeof useEditor>
  dialogs: Dialogs
  /** 音声を開いていないか、処理中 */
  noClip: boolean
  /** noClip か、選択範囲がない */
  noSel: boolean
}

/** 1 つの操作 */
export interface Command {
  label: MessageKey
  /** 押せるか（省くといつも押せる） */
  enabled?: (c: CommandContext) => boolean
  /** オンとオフの操作なら、今オンか */
  checked?: (c: CommandContext) => boolean
  run: (c: CommandContext) => void
}

/** コマンドの集まりを定義する（型を保ったまま返す） */
export const defineCommands = <T extends Record<string, Command>>(commands: T) => commands
