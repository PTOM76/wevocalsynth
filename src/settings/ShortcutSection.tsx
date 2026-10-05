import { useMemo } from 'react'
import { KeymapEditor } from 'pevenmui'
import { ACTIONS, defaultKeys, type KeymapOverrides } from './keymap'
import type { CtrlSAction } from './settings'
import { useT } from '../i18n/i18n'

interface Props {
  keymap: KeymapOverrides
  ctrlS: CtrlSAction
  onChange: (keymap: KeymapOverrides) => void
}

/** キーボードショートカットの割り当て（設定の「キーとマウス」）。画面は PevenMUI の KeymapEditor、操作の一覧と既定のキーは keymap.ts */
export default function ShortcutSection({ keymap, ctrlS, onChange }: Props) {
  const t = useT()
  const actions = useMemo(() => ACTIONS.map((a) => ({ ...a, label: t(a.label) })), [t])
  return <KeymapEditor actions={actions} overrides={keymap} defaults={(id) => defaultKeys(id, ctrlS)} onChange={onChange} />
}
