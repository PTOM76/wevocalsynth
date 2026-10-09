// 選択範囲を繰り返すダイアログ
import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { NumberInput } from './inspector/Inspector'
import { useT } from '../i18n/i18n'
import { pevenFont } from 'pevenmui'

/** 選択範囲を繰り返す回数を決める（元の範囲を含めた全部の回数）。`open` の間だけ出る */
export default function RepeatDialog(p: { open: boolean; onClose: () => void; onRepeat: (count: number) => void }) {
  const t = useT()
  const [count, setCount] = useState(4)
  const ok = () => {
    if (count >= 2) p.onRepeat(count)
    p.onClose()
  }
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs" onKeyDown={(e) => e.key === 'Enter' && ok()}>
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t('repeat.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <NumberInput value={count} onChange={(v) => setCount(Math.round(v))} min={2} max={64} step={1} unit={t('repeat.unit')} width={110} ariaLabel={t('repeat.count')} />
        </Box>
        <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'text.secondary', mt: 1 }}>{t('repeat.help')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={count < 2} onClick={ok}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}
