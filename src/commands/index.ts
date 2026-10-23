// コマンドの一覧と、メニューの項目を作る関数
import { useCommandKeys as usePevenCommandKeys, useCommandSet } from 'pevenmui'
import { useT } from '../i18n/i18n'
import { keyLabelOf, type ActionId, type Keymap } from '../settings/keymap'
import { editCommands } from './edit'
import { fileCommands } from './file'
import { helpCommands } from './help'
import { playCommands } from './play'
import { toolCommands } from './tools'
import { trackCommands } from './track'
import type { Command, CommandContext } from './types'
import { viewCommands } from './view'

/** すべてのコマンド。分類ごとのファイルで定義して、ここに足す */
export const COMMANDS = { ...fileCommands, ...editCommands, ...viewCommands, ...playCommands, ...trackCommands, ...toolCommands, ...helpCommands }

export type CommandId = keyof typeof COMMANDS

// キーを割り当てられる操作は、どれもコマンドにする（足し忘れると型エラー）
COMMANDS satisfies Record<ActionId, Command>
export type { Command, CommandContext }

/** ツールチップの文字。キーを割り当てていれば「名前 (キー)」 */
export function withKey(label: string, keymap: Keymap, id: ActionId) {
  const key = keyLabelOf(keymap, id)
  return key ? `${label} (${key})` : label
}

/** コマンドを使う（App で 1 回呼ぶ）。item(id) はメニューの項目、run、enabled は実行と判定（PevenMUI の useCommandSet） */
export function useCommands(ctx: CommandContext, keymap: Keymap) {
  return useCommandSet(COMMANDS as Record<CommandId, Command>, ctx, keymap, useT())
}

export type Commands = ReturnType<typeof useCommands>

/** キーの割り当てにある操作を、コマンドで処理する（App で 1 回呼ぶ。PevenMUI の useCommandKeys） */
export function useCommandKeys(commands: Commands, keymap: Keymap) {
  usePevenCommandKeys(commands, COMMANDS as Record<ActionId, Command>, keymap)
}
