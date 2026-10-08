import type { MenuEntry } from 'pevenmui'
import { useT } from '../../i18n/i18n'
import { useAppSettings } from '../settings'
import type { AnyItem } from './define'
import { ITEMS, type Settings } from '.'

/** 値が boolean の設定の名前 */
export type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

/** オンとオフの設定を切り替えるメニューの項目を作る（名前は定義の label。rest で checked や disabled を足す） */
export function useToggleItem() {
  const { settings, update } = useAppSettings()
  const t = useT()
  return (key: BoolKey, rest: { checked?: boolean; disabled?: boolean; shortcut?: string } = {}): MenuEntry => ({
    label: t((ITEMS[key] as AnyItem).label!),
    checked: settings[key],
    onClick: () => update({ [key]: !settings[key] }),
    ...rest,
  })
}
