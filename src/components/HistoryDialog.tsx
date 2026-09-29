import { Dialog, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import { useT } from '../i18n/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 操作の名前（行った順） */
  labels: string[]
  /** そのうち今までに行った数。これより後ろはやり直せる操作 */
  done: number
  onJump: (done: number) => void
}

/**
 * 操作履歴の一覧。押した操作の直後の状態へ、まとめて戻る・進む。
 * 一番上の「開いたとき」を押すと、履歴に残っている一番古い状態に戻る
 */
export default function HistoryDialog(p: Props) {
  const t = useT()
  const rows = [t('history.opened'), ...p.labels]
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('history.title')}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <List dense>
          {rows.map((label, i) => (
            <ListItemButton key={i} selected={i === p.done} onClick={() => p.onJump(i)}>
              <ListItemText
                primary={label}
                // やり直せる操作（今より後ろ）は薄く出す
                slotProps={{ primary: { sx: { fontSize: 13, color: i > p.done ? 'text.disabled' : 'text.primary' } } }}
              />
              {i === p.done && <Typography sx={{ fontSize: 11, color: 'primary.main' }}>{t('history.current')}</Typography>}
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  )
}
