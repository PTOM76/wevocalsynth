import { Box, Button, Slider, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnet } from '@fortawesome/free-solid-svg-icons'
import { describePitch } from '../audio/notes'
import { useT } from '../i18n/i18n'

interface Props {
  /** ピッチ変更量（半音、小数可） */
  semitones: number
  onChange: (semitones: number) => void
  /** 範囲の今の音程（MIDI ノート番号）。解析中は undefined、無声・複数範囲などは null */
  currentMidi: number | null | undefined
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** ピッチ変更量の指定。今の音程と変更後の音程を表示し、最寄りの音名に合わせられる */
export default function PitchControl({ semitones, onChange, currentMidi }: Props) {
  const t = useT()
  const target = currentMidi != null ? currentMidi + semitones : null

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">{t('process.pitch')}</Typography>
        <TextField
          size="small"
          type="number"
          value={semitones}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(Math.min(24, Math.max(-24, v)))
          }}
          slotProps={{ htmlInput: { min: -24, max: 24, step: 0.01, 'aria-label': t('process.pitchAria') } }}
          sx={{ width: 96 }}
        />
      </Stack>
      <Slider
        aria-label={t('process.pitchAria')}
        value={semitones}
        min={-24}
        max={24}
        step={0.1}
        marks={[-24, -12, 0, 12, 24].map((v) => ({ value: v, label: v > 0 ? `+${v}` : `${v}` }))}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
        onChange={(_, v) => onChange(round2(v as number))}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 32 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {currentMidi === undefined
            ? t('process.noteAnalyzing')
            : currentMidi === null || target === null
              ? t('process.noteUnknown')
              : semitones === 0
                ? t('process.note', { note: describePitch(currentMidi) })
                : t('process.noteChange', { from: describePitch(currentMidi), to: describePitch(target) })}
        </Typography>
        <Tooltip title={t('process.snapTooltip')}>
          <span>
            <Button
              size="small"
              startIcon={<FontAwesomeIcon icon={faMagnet} />}
              disabled={target === null}
              onClick={() => target !== null && onChange(round2(semitones + Math.round(target) - target))}
            >
              {t('process.snap')}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  )
}
