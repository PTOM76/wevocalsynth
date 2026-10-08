// コマンドの一覧と、メニューの項目を作る関数
import type { MenuEntry } from 'pevenmui'
import { useRef } from 'react'
import { useT } from '../i18n/i18n'
import { keyLabelOf, type ActionId, type Keymap } from '../settings/keymap'
import { editCommands } from './edit'
import type { Command, CommandContext } from './types'

/** すべてのコマンド。分類ごとのファイルで定義して、ここに足す */
export const COMMANDS = { ...editCommands }

export type CommandId = keyof typeof COMMANDS
export type { Command, CommandContext }

/**
 * コマンドを使う（App で 1 回呼ぶ）。今の状態は ref に持ち、実行や判定のときに最新を読む。
 * `item(id)` はメニューの項目を作る（名前、キーの表記、押せるか、チェック）
 */
export function useCommands(ctx: CommandContext, keymap: Keymap) {
  const t = useT()
  const ref = useRef(ctx)
  ref.current = ctx
  const of = (id: CommandId) => COMMANDS[id] as Command
  const enabled = (id: CommandId) => of(id).enabled?.(ref.current) ?? true
  const run = (id: CommandId) => {
    if (enabled(id)) of(id).run(ref.current)
  }
  const item = (id: CommandId): MenuEntry => {
    const cmd = of(id)
    return {
      label: t(cmd.label),
      // キーを割り当てられる操作なら、今の割り当ての表記
      shortcut: id in keymap ? keyLabelOf(keymap, id as ActionId) : undefined,
      disabled: !enabled(id),
      checked: cmd.checked?.(ref.current),
      onClick: () => run(id),
    }
  }
  return { item, run, enabled }
}

export type Commands = ReturnType<typeof useCommands>
