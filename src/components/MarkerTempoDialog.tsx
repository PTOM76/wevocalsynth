// マーカーからのテンポを決めるダイアログ
import { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { NumberInput } from './inspector/Inspector'
import type { Marker } from '../project/projectFile'
import { useT } from '../i18n/i18n'
import { pevenFont } from 'pevenmui'

/**
 * マーカーに「ここからのテンポ」を持たせる（テンポが途中で変わる曲）。`marker` が null なら閉じている。
 * 初期値は、そのマーカーのテンポか、なければその位置のテンポ（`current`）
 */
export default function MarkerTempoDialog(p: {
  marker: Marker | null
  current: { bpm: number; beatsPerBar: number }
  onClose: () => void
  onChange: (tempo: Marker['tempo']) => void
}) {
  const t = useT()
  const [bpm, setBpm] = useState(120)
  const [beatsPerBar, setBeatsPerBar] = useState(4)
  const { marker, current } = p
  useEffect(() => {
    if (!marker) return
    setBpm(Math.round((marker.tempo?.bpm ?? current.bpm) * 100) / 100)
    setBeatsPerBar(marker.tempo?.beatsPerBar ?? current.beatsPerBar)
    // 開いたときだけ初期値を入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marker?.id])
  const done = (tempo: Marker['tempo']) => {
    p.onChange(tempo)
    p.onClose()
  }
  const ok = () => bpm > 0 && done({ bpm, beatsPerBar: Math.max(1, Math.round(beatsPerBar)) })
  return (
    <Dialog open={!!marker} onClose={p.onClose} fullWidth maxWidth="xs" onKeyDown={(e) => e.key === 'Enter' && ok()}>
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t('markerTempo.title', { name: marker?.name ?? '' })}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', alignItems: 'center', justifyContent: 'start', columnGap: 2, rowGap: 1, mt: 1 }}>
          <Typography sx={{ fontSize: pevenFont('base') }}>BPM</Typography>
          <NumberInput value={bpm} onChange={setBpm} min={20} max={400} step={0.01} unit="BPM" width={110} ariaLabel="BPM" />
          <Typography sx={{ fontSize: pevenFont('base') }}>{t('settings.beatsPerBar')}</Typography>
          <NumberInput value={beatsPerBar} onChange={(v) => setBeatsPerBar(Math.round(v))} min={1} max={16} step={1} width={110} ariaLabel={t('settings.beatsPerBar')} />
        </Box>
      </DialogContent>
      <DialogActions>
        {/* テンポを外すと、前のテンポがそのまま続く */}
        <Button size="small" color="error" disabled={!marker?.tempo} onClick={() => done(undefined)} sx={{ mr: 'auto' }}>
          {t('markerTempo.remove')}
        </Button>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={!(bpm > 0)} onClick={ok}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}
