import { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select } from '@mui/material'
import { NumberInput } from './inspector/Inspector'
import { useT } from '../i18n/i18n'
import { pevenFont } from 'pevenmui'

/** 無音を挿入する長さを決める。`open` の間だけ出る。長さは秒か拍で入れ、秒にして返す */
export default function SilenceDialog(p: { open: boolean; bpm: number; beatsPerBar: number; defaultSec: number | null; onClose: () => void; onInsert: (sec: number) => void }) {
  const t = useT()
  const [unit, setUnit] = useState<'sec' | 'beat'>('beat')
  const [value, setValue] = useState(4)
  // 開くたびに初期値: 選択範囲があればその長さ（秒）、なければ1小節
  useEffect(() => {
    if (!p.open) return
    if (p.defaultSec !== null) {
      setUnit('sec')
      setValue(Math.round(p.defaultSec * 1000) / 1000)
    } else {
      setUnit('beat')
      setValue(p.beatsPerBar)
    }
  }, [p.open, p.defaultSec, p.beatsPerBar])
  const sec = unit === 'sec' ? value : (value * 60) / Math.max(1, p.bpm)
  const ok = () => {
    if (sec > 0) p.onInsert(sec)
    p.onClose()
  }
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs" onKeyDown={(e) => e.key === 'Enter' && ok()}>
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t('silence.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <NumberInput value={value} onChange={setValue} min={0.001} max={3600} step={unit === 'sec' ? 0.1 : 1} width={110} ariaLabel={t('silence.length')} />
          <Select size="small" value={unit} onChange={(e) => setUnit(e.target.value as 'sec' | 'beat')} sx={{ fontSize: pevenFont('base'), '& .MuiSelect-select': { py: 0.5 } }}>
            <MenuItem value="sec" sx={{ fontSize: pevenFont('base') }}>
              {t('vibrato.secondUnit')}
            </MenuItem>
            <MenuItem value="beat" sx={{ fontSize: pevenFont('base') }}>
              {t('process.beatUnit')}
            </MenuItem>
          </Select>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={!(sec > 0)} onClick={ok}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}
