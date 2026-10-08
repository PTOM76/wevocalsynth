// コマンドの一覧と、メニューの項目を作る関数
import type { MenuEntry } from 'pevenmui'
import { useRef } from 'react'
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
export type { Command, CommandContext }

/**
 * コマンドを使う（App で 1 回呼ぶ）。今の状態は ref に持ち、実行や判定のときに最新を読む。
 * `item(id)` はメニューの項目を作る（名前、キーの表記、押せるか、チェック）。表示しないコマンドは null
 */
export function useCommands(ctx: CommandContext, keymap: Keymap) {
  const t = useT()
  const ref = useRef(ctx)
  ref.current = ctx
  const of = (id: CommandId) => COMMANDS[id] as Command
  const visible = (id: CommandId) => of(id).visible?.(ref.current) ?? true
  const enabled = (id: CommandId) => visible(id) && (of(id).enabled?.(ref.current) ?? true)
  const run = (id: CommandId) => {
    if (enabled(id)) of(id).run(ref.current)
  }
  const item = (id: CommandId): MenuEntry | null => {
    if (!visible(id)) return null
    const cmd = of(id)
    const c = ref.current
    return {
      label: typeof cmd.label === 'function' ? cmd.label(c, t) : t(cmd.label),
      // キーを割り当てられる操作なら今の割り当て、そうでなければホイールなどの操作の表記
      shortcut: id in keymap ? keyLabelOf(keymap, id as ActionId) : cmd.hint?.(c),
      disabled: !enabled(id),
      checked: cmd.checked?.(c),
      onClick: () => run(id),
    }
  }
  return { item, run, enabled, ctx: () => ref.current }
}

export type Commands = ReturnType<typeof useCommands>
