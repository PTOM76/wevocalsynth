import { Dialog, DialogContent, DialogTitle, Table, TableBody, TableCell, TableRow } from '@mui/material'
import { useT, type MessageKey } from '../i18n/i18n'

/** [キー（文字列または訳文キー）, 説明の訳文キー] */
const SHORTCUTS: [string | MessageKey, MessageKey][] = [
  ['Space', 'shortcuts.playPause'],
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
]

/** キーボード・マウス操作の一覧 */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  // 'shortcuts.' で始まるものは訳文キー、それ以外はキー名そのもの
  const keyLabel = (k: string) => (k.startsWith('shortcuts.') ? t(k as MessageKey) : k)
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('menu.shortcuts')}</DialogTitle>
      <DialogContent>
        <Table size="small">
          <TableBody>
            {SHORTCUTS.map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{keyLabel(key)}</TableCell>
                <TableCell>{t(desc)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
