// 無音で区切って選択するダイアログ
import { useMemo, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import type { Clip, Range } from '../audio/types'
import { DEFAULT_SILENCE, findSounds } from '../audio/silence'
import { NumberInput } from './inspector/Inspector'
import { useT } from '../i18n/i18n'
import { pevenFont } from 'pevenmui'

/** 無音で区切って、音のある所を選択する。しきい値と、区切りにする無音の長さを決める。見つかった範囲の数はその場で出す */
export default function SoundSelectDialog(p: { open: boolean; clip: Clip | null; onClose: () => void; onSelect: (ranges: Range[]) => void }) {
  const t = useT()
  const [thresholdDb, setThresholdDb] = useState(DEFAULT_SILENCE.thresholdDb)
  const [minSilenceMs, setMinSilenceMs] = useState(DEFAULT_SILENCE.minSilenceSec * 1000)
  const ranges = useMemo(
    () => (p.open && p.clip ? findSounds(p.clip, { thresholdDb, minSilenceSec: minSilenceMs / 1000 }) : []),
    [p.open, p.clip, thresholdDb, minSilenceMs],
  )
  const ok = () => {
    if (ranges.length) p.onSelect(ranges)
    p.onClose()
  }
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs" onKeyDown={(e) => e.key === 'Enter' && ok()}>
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t('soundSelect.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', alignItems: 'center', justifyContent: 'start', columnGap: 2, rowGap: 1, mt: 1 }}>
          <Typography sx={{ fontSize: pevenFont('base') }}>{t('soundSelect.threshold')}</Typography>
          <NumberInput value={thresholdDb} onChange={(v) => setThresholdDb(Math.round(v))} min={-90} max={-10} step={1} unit="dB" width={110} ariaLabel={t('soundSelect.threshold')} />
          <Typography sx={{ fontSize: pevenFont('base') }}>{t('soundSelect.minSilence')}</Typography>
          <NumberInput value={minSilenceMs} onChange={(v) => setMinSilenceMs(Math.round(v))} min={20} max={5000} step={10} unit="ms" width={110} ariaLabel={t('soundSelect.minSilence')} />
        </Box>
        <Typography sx={{ fontSize: pevenFont('base'), mt: 2 }}>{t('soundSelect.found', { n: ranges.length })}</Typography>
        <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'text.secondary', mt: 1 }}>
          {t('soundSelect.hint', { menu: t('track.moveSelection') })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={!ranges.length} onClick={ok}>
          {t('soundSelect.select')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
