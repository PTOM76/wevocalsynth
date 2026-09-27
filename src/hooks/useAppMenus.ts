import type { MenuEntry, MenuGroup } from '../components/menu/MenuList'
import { useT } from '../i18n/i18n'

interface Actions {
  hasClip: boolean
  hasSelection: boolean
  hasClipboard: boolean
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  showSpectrogram: boolean
  showPitch: boolean
  open: () => void
  save: () => void
  openExport: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  trim: () => void
  clearSelection: () => void
  selectAll: () => void
  playSelection: () => void
  toggleLoop: () => void
  toggleSpectrogram: () => void
  togglePitch: () => void
  showShortcuts: () => void
  showSettings: () => void
}

/** メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身 */
export function useAppMenus(a: Actions): { menus: MenuGroup[]; context: MenuEntry[] } {
  const t = useT()
  const noClip = !a.hasClip || a.busy
  const noSel = noClip || !a.hasSelection
  const edit: MenuEntry[] = [
    { label: t('edit.cut'), shortcut: 'Ctrl+X', disabled: noSel, onClick: a.cut },
    { label: t('edit.copy'), shortcut: 'Ctrl+C', disabled: noSel, onClick: a.copy },
    { label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: t('edit.trim'), disabled: noSel, onClick: a.trim },
    { divider: true },
    { label: t('edit.selectAll'), shortcut: 'Ctrl+A', disabled: noClip, onClick: a.selectAll },
    { label: t('edit.clearSelection'), shortcut: 'Esc', disabled: noSel, onClick: a.clearSelection },
  ]

  const menus: MenuGroup[] = [
    {
      label: t('menu.file'),
      entries: [
        { label: t('menu.open'), shortcut: 'Ctrl+O', disabled: a.busy, onClick: a.open },
        { label: t('menu.saveProject'), shortcut: 'Ctrl+S', disabled: noClip, onClick: a.save },
        { divider: true },
        { label: t('menu.export'), shortcut: 'Ctrl+E', disabled: noClip, onClick: a.openExport },
        { divider: true },
        { label: t('menu.settings'), onClick: a.showSettings },
      ],
    },
    {
      label: t('menu.edit'),
      entries: [
        { label: t('common.undo'), shortcut: 'Ctrl+Z', disabled: !a.canUndo || a.busy, onClick: a.undo },
        { label: t('common.redo'), shortcut: 'Ctrl+Y', disabled: !a.canRedo || a.busy, onClick: a.redo },
        { divider: true },
        ...edit,
      ],
    },
    {
      label: t('menu.view'),
      entries: [
        { label: t('menu.spectrogram'), checked: a.showSpectrogram, disabled: !a.hasClip, onClick: a.toggleSpectrogram },
        { label: t('menu.pitch'), checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
      ],
    },
    { label: t('menu.help'), entries: [{ label: t('menu.shortcuts'), onClick: a.showShortcuts }] },
  ]

  const context: MenuEntry[] = [
    { label: t('play.playSelection'), disabled: noSel, onClick: a.playSelection },
    { label: t('play.loopPreview'), disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    ...edit,
  ]

  return { menus, context }
}
