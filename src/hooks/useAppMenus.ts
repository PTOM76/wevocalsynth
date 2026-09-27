import type { WavFormat } from '../audio/wav'
import type { MenuEntry, MenuGroup } from '../components/menu/MenuList'

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
  exportWav: (format: WavFormat) => void
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
}

/** メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身 */
export function useAppMenus(a: Actions): { menus: MenuGroup[]; context: MenuEntry[] } {
  const noClip = !a.hasClip || a.busy
  const noSel = noClip || !a.hasSelection
  const edit: MenuEntry[] = [
    { label: '切り取り', shortcut: 'Ctrl+X', disabled: noSel, onClick: a.cut },
    { label: 'コピー', shortcut: 'Ctrl+C', disabled: noSel, onClick: a.copy },
    { label: '再生位置に貼り付け', shortcut: 'Ctrl+V', disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: '選択範囲のみ残す', disabled: noSel, onClick: a.trim },
    { divider: true },
    { label: 'すべて選択', shortcut: 'Ctrl+A', disabled: noClip, onClick: a.selectAll },
    { label: '選択解除', shortcut: 'Esc', disabled: noSel, onClick: a.clearSelection },
  ]

  const menus: MenuGroup[] = [
    {
      label: 'ファイル',
      entries: [
        { label: '開く…', shortcut: 'Ctrl+O', disabled: a.busy, onClick: a.open },
        { label: 'プロジェクトを保存', shortcut: 'Ctrl+S', disabled: noClip, onClick: a.save },
        { divider: true },
        { label: 'WAV出力（16-bit PCM）', disabled: noClip, onClick: () => a.exportWav('pcm16') },
        { label: 'WAV出力（24-bit PCM）', disabled: noClip, onClick: () => a.exportWav('pcm24') },
        { label: 'WAV出力（32-bit float）', disabled: noClip, onClick: () => a.exportWav('float32') },
      ],
    },
    {
      label: '編集',
      entries: [
        { label: '元に戻す', shortcut: 'Ctrl+Z', disabled: !a.canUndo || a.busy, onClick: a.undo },
        { label: 'やり直す', shortcut: 'Ctrl+Y', disabled: !a.canRedo || a.busy, onClick: a.redo },
        { divider: true },
        ...edit,
      ],
    },
    {
      label: '表示',
      entries: [
        { label: 'スペクトログラム', checked: a.showSpectrogram, disabled: !a.hasClip, onClick: a.toggleSpectrogram },
        { label: 'ピッチ', checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
      ],
    },
    { label: 'ヘルプ', entries: [{ label: 'ショートカット一覧', onClick: a.showShortcuts }] },
  ]

  const context: MenuEntry[] = [
    { label: '範囲を試聴', disabled: noSel, onClick: a.playSelection },
    { label: 'ループ試聴', disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    ...edit,
  ]

  return { menus, context }
}
