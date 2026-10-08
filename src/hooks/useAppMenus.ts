// メニューバーと右クリックメニューを作る（項目は menus/）
import type { MenuEntry, MenuGroup } from 'pevenmui'
import { keyLabelOf, type ActionId } from '../settings/keymap'
import { useT } from '../i18n/i18n'
import { useAppSettings } from '../settings/settings'
import { useToggleItem } from '../settings/items/toggle'
import type { MenuActions } from './menus/actions'
import type { MenuCtx } from './menus/shared'
import { menuBar } from './menus/menuBar'
import { contextMenu } from './menus/context'

export type { MenuActions }

/**
 * メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身。
 * 項目は menus/ にある（menuBar.ts、context.ts、共通の部分は shared.ts）
 */
export function useAppMenus(a: MenuActions): { menus: MenuGroup[]; mobileMenus: MenuGroup[]; context: MenuEntry[] } {
  const t = useT()
  // 設定から読むもの（App を通さない）と、設定の切り替えの項目
  const { settings: s } = useAppSettings()
  const toggle = useToggleItem()
  const noClip = !a.hasClip || a.busy
  const noSel = noClip || !a.hasSelection
  const c: MenuCtx = { a, t, key: (id: ActionId) => keyLabelOf(a.keymap, id), s, toggle, noClip, noSel, noVoicing: noSel || !a.pitchReady, noPitch: noClip || !a.pitchReady }
  const menus = menuBar(c)
  // スマホの ⋮ は PC のメニューバーと同じまとまりにし、段階で開く（PevenMUI の DrillMenu。スマホから使えない操作をなくす）。
  // キーボードがないので、ショートカット一覧だけは出さない
  const mobileMenus: MenuGroup[] = menus.map((g) => ({ ...g, entries: g.entries.filter((e) => !('label' in e && e.label === t('menu.shortcuts'))) }))
  return { menus, mobileMenus, context: contextMenu(c) }
}
