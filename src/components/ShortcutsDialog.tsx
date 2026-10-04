import { ShortcutsDialog as PevenShortcutsDialog } from 'pevenmui'
import { useT, type MessageKey } from '../i18n/i18n'
import type { WheelZoom } from '../settings/settings'

/** [キー（文字列または訳文キー）, 説明の訳文キー] */
const SHORTCUTS: [string | MessageKey, MessageKey][] = [
  ['Space', 'shortcuts.playPause'],
  ['← / → (Shift)', 'shortcuts.seek'],
  ['Home / End', 'shortcuts.seekEdge'],
  ['Ctrl+Z / Ctrl+Y', 'shortcuts.undoRedo'],
  ['Ctrl+X / C / V', 'shortcuts.clipboard'],
  ['Ctrl+A / Esc', 'shortcuts.selectAll'],
  ['Ctrl+O / Ctrl+S / Ctrl+Shift+S', 'shortcuts.openSave'],
  ['shortcuts.drag', 'shortcuts.select'],
  ['shortcuts.ctrlDrag', 'shortcuts.addRange'],
  ['shortcuts.edgeDrag', 'shortcuts.adjust'],
  ['shortcuts.rightClick', 'shortcuts.contextMenu'],
  ['shortcuts.wheel', 'shortcuts.scrollZoom'],
  ['shortcuts.penKeys', 'shortcuts.penModifiers'],
  ['↑ / ↓ (Shift)', 'shortcuts.pitchShift'],
  ['Tab / Shift+Tab', 'shortcuts.stepSelection'],
  ['Alt', 'shortcuts.noSnap'],
]

/** キーボード・マウス操作の一覧 */
export default function ShortcutsDialog({ open, onClose, wheelZoom = 'ctrl' }: { open: boolean; onClose: () => void; wheelZoom?: WheelZoom }) {
  const t = useT()
  // 'shortcuts.' で始まるものは訳文キー、それ以外はキー名そのもの
  const keyLabel = (k: string) => (k.startsWith('shortcuts.') ? t(k as MessageKey) : k)
  return (
    <PevenShortcutsDialog
      open={open}
      onClose={onClose}
      title={t('menu.shortcuts')}
      // ホイールだけで拡大縮小する設定なら、ホイールの説明を入れ替える
      rows={SHORTCUTS.map(([key, desc]) => [keyLabel(key), t(desc === 'shortcuts.scrollZoom' && wheelZoom === 'wheel' ? 'shortcuts.zoomScroll' : desc)])}
    />
  )
}
