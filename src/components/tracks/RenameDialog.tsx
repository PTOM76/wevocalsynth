import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useT } from '../../i18n/i18n'

/** トラックの名前の変更。`name` が null なら閉じている */
export default function RenameDialog(p: { name: string | null; onClose: () => void; onRename: (name: string) => void }) {
  const t = useT()
  const [value, setValue] = useState('')
  useEffect(() => {
    if (p.name !== null) setValue(p.name)
  }, [p.name])
  const ok = () => {
    if (value.trim()) p.onRename(value)
    p.onClose()
  }
  return (
    <Dialog open={p.name !== null} onClose={p.onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('track.rename')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
          // 開いたときに全体を選んでおき、そのまま打ち直せるようにする
          onFocus={(e) => e.target.select()}
          slotProps={{ htmlInput: { 'aria-label': t('track.rename') } }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={!value.trim()} onClick={ok}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}
