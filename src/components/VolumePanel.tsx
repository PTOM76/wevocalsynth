import { useState } from 'react'
import { Button, Card, CardContent, Slider, Stack, TextField, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'

export type VolumeAction = 'fadeIn' | 'fadeOut' | 'normalize' | 'silence'

interface Props {
  hasSelection: boolean
  busy: boolean
  onGain: (db: number) => void
  onAction: (action: VolumeAction) => void
}

const ACTIONS: { action: VolumeAction; label: string }[] = [
  { action: 'fadeIn', label: 'フェードイン' },
  { action: 'fadeOut', label: 'フェードアウト' },
  { action: 'normalize', label: 'ノーマライズ' },
  { action: 'silence', label: '無音化' },
]

export default function VolumePanel({ hasSelection, busy, onGain, onAction }: Props) {
  const [db, setDb] = useState(0)

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Typography variant="h6">音量</Typography>
            <Typography variant="body2" color="text.secondary">
              {hasSelection ? '選択範囲' : '全体'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Slider
              aria-label="ゲイン（dB）"
              value={db}
              min={-24}
              max={12}
              step={0.5}
              marks={[-24, -12, -6, 0, 6, 12].map((v) => ({ value: v, label: v > 0 ? `+${v}` : `${v}` }))}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v} dB`}
              onChange={(_, v) => setDb(v as number)}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              size="small"
              type="number"
              label="dB"
              value={db}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) setDb(Math.min(12, Math.max(-24, v)))
              }}
              slotProps={{ htmlInput: { min: -24, max: 12, step: 0.5 } }}
              sx={{ width: 90 }}
            />
            <Button
              variant="contained"
              startIcon={<FontAwesomeIcon icon={faCheck} />}
              disabled={busy || db === 0}
              onClick={() => {
                onGain(db)
                setDb(0)
              }}
            >
              適用
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {ACTIONS.map(({ action, label }) => (
              <Button key={action} variant="outlined" size="small" disabled={busy} onClick={() => onAction(action)}>
                {label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
