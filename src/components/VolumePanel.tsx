import { Box, Button, Slider } from '@mui/material'
import { COMPACT_SLIDER_SX, InspectorSection, NumberInput, PropRow } from './inspector/Inspector'
import { useT, type MessageKey } from '../i18n/i18n'

export type VolumeAction = 'fadeIn' | 'fadeOut' | 'normalize' | 'silence'

interface Props {
  hasSelection: boolean
  busy: boolean
  /** 適用前の音量（スライダーの値）。再生中の音にすぐ反映される */
  db: number
  onDbChange: (db: number) => void
  onGain: (db: number) => void
  onAction: (action: VolumeAction) => void
}

const ACTIONS: { action: VolumeAction; label: MessageKey }[] = [
  { action: 'fadeIn', label: 'volume.fadeIn' },
  { action: 'fadeOut', label: 'volume.fadeOut' },
  { action: 'normalize', label: 'volume.normalize' },
  { action: 'silence', label: 'volume.silence' },
]

const SMALL_BUTTON_SX = { minWidth: 0, height: 26, px: 1, fontSize: 12 } as const

/** インスペクタの「音量」。ゲインの行（動かすと再生中の音にすぐ反映し、「適用」で確定）と、フェードなどの操作 */
export default function VolumePanel({ hasSelection, busy, db, onDbChange: setDb, onGain, onAction }: Props) {
  const t = useT()

  return (
    <InspectorSection title={t('volume.title')} extra={t(hasSelection ? 'common.selection' : 'common.whole')}>
      <PropRow label={t('volume.gain')}>
        <Slider
          aria-label={t('volume.gainAria')}
          value={db}
          min={-24}
          max={12}
          step={0.5}
          marks={[-12, 0].map((value) => ({ value }))}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(_, v) => setDb(v as number)}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput value={db} onChange={setDb} min={-24} max={12} step={0.5} unit="dB" ariaLabel={t('volume.gainAria')} />
      </PropRow>
      <PropRow>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="contained"
          disabled={busy || db === 0}
          onClick={() => {
            onGain(db)
            setDb(0)
          }}
          sx={{ ...SMALL_BUTTON_SX, px: 1.5 }}
        >
          {t('common.apply')}
        </Button>
      </PropRow>
      {/* 2列に並べる（横幅の狭いインスペクタでも折り返しで崩れないように） */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {ACTIONS.map(({ action, label }) => (
          <Button key={action} size="small" variant="outlined" disabled={busy} onClick={() => onAction(action)} sx={SMALL_BUTTON_SX}>
            {t(label)}
          </Button>
        ))}
      </Box>
    </InspectorSection>
  )
}
