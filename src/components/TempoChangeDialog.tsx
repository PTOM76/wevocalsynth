// テンポの途中の変化を見つけたときに、マーカーを置くかを尋ねるダイアログ
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, Typography } from '@mui/material'
import { pevenFont } from 'pevenmui'
import type { TempoChangeSection } from '../audio/tempoChange'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'

/**
 * 自動解析で、途中でテンポが変わるのを見つけたときに尋ねる。採用するとテンポのマーカーを置き、見送ると一定のテンポのまま。
 * 行を押すとその位置へ移動する
 */
export default function TempoChangeDialog(p: {
  open: boolean
  sections: TempoChangeSection[]
  onSeek: (time: number) => void
  onAdopt: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t('tempoChange.title')}</DialogTitle>
      <DialogContent>
        <Typography className="selectable" sx={{ fontSize: pevenFont('base'), mb: 1 }}>{t('tempoChange.message')}</Typography>
        <List dense disablePadding>
          {p.sections.map((s) => (
            <ListItemButton key={s.time} onClick={() => p.onSeek(s.time)} sx={{ fontSize: pevenFont('base'), gap: 2 }}>
              <span style={{ minWidth: 72, fontVariantNumeric: 'tabular-nums' }}>{formatTime(s.time)}</span>
              <span>{Math.round(s.bpm * 100) / 100} BPM</span>
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t('tempoChange.keep')}
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            p.onAdopt()
            p.onClose()
          }}
        >
          {t('tempoChange.adopt')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
