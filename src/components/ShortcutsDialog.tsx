import { Dialog, DialogContent, DialogTitle, Table, TableBody, TableCell, TableRow } from '@mui/material'

const SHORTCUTS: [string, string][] = [
  ['Space', '再生 / 一時停止'],
  ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直す'],
  ['Ctrl+X / C / V', '切り取り / コピー / 再生位置に貼り付け'],
  ['Ctrl+A / Esc', 'すべて選択 / 選択解除'],
  ['Ctrl+O / Ctrl+S', '開く / プロジェクトを保存'],
  ['ドラッグ', '範囲選択'],
  ['Ctrl+ドラッグ', '範囲を追加'],
  ['範囲の端をドラッグ', '範囲を調整（Shift+右端で伸縮）'],
  ['右クリック', '編集メニュー'],
  ['ホイール / Ctrl+ホイール', '横スクロール / 拡大縮小'],
  ['ピッチを描く中の Shift / Alt', '半音に吸着 / 消す'],
]

/** キーボード・マウス操作の一覧 */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>ショートカット一覧</DialogTitle>
      <DialogContent>
        <Table size="small">
          <TableBody>
            {SHORTCUTS.map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{key}</TableCell>
                <TableCell>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
