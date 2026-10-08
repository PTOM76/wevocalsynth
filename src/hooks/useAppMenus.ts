// メニューバーと右クリックメニューを、並び（commands/menus.ts）とコマンドから作る
import type { MenuEntry, MenuGroup } from 'pevenmui'
import { useT } from '../i18n/i18n'
import type { Commands } from '../commands'
import { CONTEXT_MENU, MENU_BAR, type MenuItem } from '../commands/menus'

/** 区切りを整える（先頭と末尾の区切り、続いた区切りを消す。表示しない項目を除いたあとに残るため） */
function tidy(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const e of entries) {
    if ('divider' in e && (!out.length || 'divider' in out[out.length - 1])) continue
    out.push(e)
  }
  while (out.length && 'divider' in out[out.length - 1]) out.pop()
  return out
}

/** メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身 */
export function useAppMenus(commands: Commands): { menus: MenuGroup[]; mobileMenus: MenuGroup[]; context: MenuEntry[] } {
  const t = useT()
  const c = commands.ctx()
  const build = (items: MenuItem[]): MenuEntry[] =>
    tidy(
      items.flatMap((it): MenuEntry[] => {
        if (it === '-') return [{ divider: true }]
        if (typeof it === 'function') return it(c, t)
        if (typeof it === 'object') {
          if (it.visible && !it.visible(c)) return []
          return [{ label: t(it.label), disabled: it.enabled ? !it.enabled(c) : false, submenu: build(it.items) }]
        }
        const e = commands.item(it)
        return e ? [e] : []
      }),
    )
  const menus: MenuGroup[] = MENU_BAR.map((g) => ({ label: t(g.label), accessKey: g.accessKey, entries: build(g.items) }))
  // スマホの ⋮ は PC のメニューバーと同じまとまりにし、段階で開く（PevenMUI の DrillMenu）。キーボードがないので、ショートカット一覧だけは出さない
  const mobileMenus = menus.map((g) => ({ ...g, entries: g.entries.filter((e) => !('label' in e && e.label === t('menu.shortcuts'))) }))
  return { menus, mobileMenus, context: build(CONTEXT_MENU) }
}
