import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  CircularProgress,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Algorithm } from '../dsp/engine'
import type { PreviewState } from '../hooks/usePreview'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRotateLeft, faHeadphones, faStop, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import { formatTime } from '../audio/types'

export interface EditParams {
  semitones: number
  stretch: number
  algorithm: Algorithm
  preserveFormant: boolean
  formantSemitones: number
}

interface Props {
  params: EditParams
  onChange: (p: EditParams) => void
  targetDuration: number
  hasSelection: boolean
  busy: boolean
  /** 処理中の進捗（0〜1） */
  progress: number
  onApply: () => void
  /** プレビューの状態。tooLong は範囲が長すぎて自動処理しない */
  preview: PreviewState
  previewPlaying: boolean
  onPreview: () => void
}

const ALGORITHM_HINT: Record<Algorithm, string> = {
  wsola: '子音に強い・高速',
  pv: '伸ばしてもなめらか・低速'
}

const STRETCH_PRESETS = [0.5, 0.75, 1, 1.5, 2, 4]

export default function EditPanel({ params, onChange, targetDuration, hasSelection, busy, progress, onApply, preview, previewPlaying, onPreview }: Props) {
  const { semitones, stretch, preserveFormant, formantSemitones } = params
  const formantShift = preserveFormant && formantSemitones !== 0
  const unchanged = semitones === 0 && stretch === 1 && !formantShift

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Typography variant="h6">加工</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={params.algorithm}
              aria-label="処理方式"
              onChange={(_, v: Algorithm | null) => v && onChange({ ...params, algorithm: v })}
            >
              <Tooltip title={ALGORITHM_HINT.wsola}>
                <ToggleButton value="wsola">WSOLA</ToggleButton>
              </Tooltip>
              <Tooltip title={ALGORITHM_HINT.pv}>
                <ToggleButton value="pv">Phase Vocoder</ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Stack>

          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">ピッチ</Typography>
              <TextField
                size="small"
                type="number"
                value={semitones}
                onChange={(e) => onChange({ ...params, semitones: clampNum(e.target.value, -24, 24, 0) })}
                slotProps={{ htmlInput: { min: -24, max: 24, step: 1 } }}
                sx={{ width: 96 }}
              />
            </Stack>
            <Slider
              aria-label="ピッチ（半音）"
              value={semitones}
              min={-24}
              max={24}
              step={1}
              marks={[-24, -12, 0, 12, 24].map((v) => ({ value: v, label: v > 0 ? `+${v}` : `${v}` }))}
              valueLabelDisplay="auto"
              onChange={(_, v) => onChange({ ...params, semitones: v as number })}
            />
          </Box>

          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preserveFormant}
                    onChange={(e) => onChange({ ...params, preserveFormant: e.target.checked })}
                  />
                }
                label={<Typography variant="subtitle2">フォルマント保持</Typography>}
              />
              <TextField
                size="small"
                type="number"
                label="移動"
                disabled={!preserveFormant}
                value={formantSemitones}
                onChange={(e) => onChange({ ...params, formantSemitones: clampNum(e.target.value, -12, 12, 0) })}
                slotProps={{ htmlInput: { min: -12, max: 12, step: 0.5 } }}
                sx={{ width: 110 }}
              />
            </Stack>
            <Slider
              aria-label="フォルマント移動（半音）"
              disabled={!preserveFormant}
              value={formantSemitones}
              min={-12}
              max={12}
              step={0.5}
              marks={[-12, -6, 0, 6, 12].map((v) => ({ value: v, label: v > 0 ? `+${v}` : `${v}` }))}
              valueLabelDisplay="auto"
              onChange={(_, v) => onChange({ ...params, formantSemitones: v as number })}
            />
          </Box>

          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">長さ</Typography>
              <TextField
                size="small"
                type="number"
                value={stretch}
                onChange={(e) => onChange({ ...params, stretch: clampNum(e.target.value, 0.25, 8, 1) })}
                slotProps={{ htmlInput: { min: 0.25, max: 8, step: 0.05 } }}
                sx={{ width: 96 }}
              />
            </Stack>
            {/* 0.5倍と2倍が1倍を中心に対称になるよう対数スケールにする */}
            <Slider
              aria-label="時間伸縮（倍率）"
              value={Math.log2(stretch)}
              min={-2}
              max={3}
              step={0.01}
              marks={[-2, -1, 0, 1, 2, 3].map((v) => ({ value: v, label: `×${2 ** v}` }))}
              scale={(v) => 2 ** v}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `×${v.toFixed(2)}`}
              onChange={(_, v) => onChange({ ...params, stretch: round2(2 ** (v as number)) })}
            />
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {STRETCH_PRESETS.map((v) => (
                <Chip
                  key={v}
                  label={`×${v}`}
                  size="small"
                  color={stretch === v ? 'primary' : 'default'}
                  variant={stretch === v ? 'filled' : 'outlined'}
                  onClick={() => onChange({ ...params, stretch: v })}
                />
              ))}
            </Stack>
          </Box>

          <Typography variant="body2" color="text.secondary">
            {hasSelection ? '選択範囲' : '全体'}: {formatTime(targetDuration)} →{' '}
            <b>{formatTime(targetDuration * stretch)}</b>
          </Typography>

          {busy && <LinearProgress variant="determinate" value={progress * 100} aria-label="処理の進捗" />}

          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
            {(preview === 'tooLong' || preview === 'multi') && !unchanged && (
              <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
                {preview === 'tooLong' ? '試聴は20秒まで' : '試聴は1範囲のみ'}
              </Typography>
            )}
            <Button
              variant="outlined"
              startIcon={
                preview === 'busy' ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <FontAwesomeIcon icon={previewPlaying ? faStop : faHeadphones} />
                )
              }
              disabled={busy || unchanged || preview !== 'ready'}
              onClick={onPreview}
            >
              {previewPlaying ? '停止' : '試聴'}
            </Button>
            <Button
              startIcon={<FontAwesomeIcon icon={faArrowRotateLeft} />}
              disabled={busy || unchanged}
              onClick={() => onChange({ ...params, semitones: 0, stretch: 1, formantSemitones: 0 })}
            >
              リセット
            </Button>
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <FontAwesomeIcon icon={faWandMagicSparkles} />}
              disabled={busy || unchanged || targetDuration <= 0}
              onClick={onApply}
            >
              {busy ? `処理中… ${Math.round(progress * 100)}%` : '適用'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function clampNum(s: string, min: number, max: number, fallback: number) {
  const v = Number(s)
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

const round2 = (v: number) => Math.round(v * 100) / 100
