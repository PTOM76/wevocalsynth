import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRotateLeft, faHeadphones, faRepeat, faStop } from '@fortawesome/free-solid-svg-icons'
import type { Algorithm } from '../dsp/engine'
import { MODE_SETTINGS, type Mode } from '../audio/detectMode'
import type { PreviewState } from '../hooks/usePreview'
import { formatTime } from '../audio/types'
import PitchControl from './PitchControl'
import AlgorithmMenu from './AlgorithmMenu'
import { COMPACT_SLIDER_SX, InspectorSection, NumberInput, PropRow } from './inspector/Inspector'
import { useT, type MessageKey } from '../i18n/i18n'

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
  /** リアルタイム試聴（範囲をループ再生し、スライダー操作を即座に反映） */
  loopPlaying: boolean
  onLoop: () => void
  /** 範囲の今の音程（MIDI）。解析中は undefined、不明は null */
  currentMidi: number | null | undefined
  /** ファイルを開いたときの自動判定の結果（未判定なら null） */
  autoMode: Mode | null
}

const MODE_HINT: Record<Mode, MessageKey> = {
  vocal: 'process.vocalHint',
  instrument: 'process.instrumentHint',
}

const STRETCH_PRESETS = [0.5, 1, 2, 4]
const round2 = (v: number) => Math.round(v * 100) / 100

/** インスペクタの小さなボタン（デスクトップアプリのボタンに近い大きさ） */
const SMALL_BUTTON_SX = { minWidth: 0, height: 26, px: 1, fontSize: 12 } as const

/** インスペクタの「加工」。モード・ピッチ・長さ・フォルマントの行と、試聴・適用 */
export default function EditPanel(p: Props) {
  const { params, onChange, busy } = p
  const { semitones, stretch, preserveFormant, formantSemitones } = params
  const t = useT()
  const set = (patch: Partial<EditParams>) => onChange({ ...params, ...patch })
  const unchanged = semitones === 0 && stretch === 1 && !(preserveFormant && formantSemitones !== 0)
  const mode: Mode = params.algorithm === 'pv' ? 'instrument' : 'vocal'

  return (
    <InspectorSection
      title={t('process.title')}
      extra={p.autoMode && t('process.autoDetected', { mode: t(p.autoMode === 'vocal' ? 'common.vocal' : 'common.instrument') })}
    >
      <PropRow label={t('process.mode')}>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={mode}
          aria-label={t('process.mode')}
          onChange={(_, v: Mode | null) => v && set(MODE_SETTINGS[v])}
          sx={{ '& .MuiToggleButton-root': { height: 24, fontSize: 12, py: 0 } }}
        >
          {(['vocal', 'instrument'] as const).map((m) => (
            <Tooltip key={m} title={t(MODE_HINT[m])}>
              <ToggleButton value={m}>{t(m === 'vocal' ? 'common.vocal' : 'common.instrument')}</ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
        <AlgorithmMenu value={params.algorithm} onChange={(algorithm) => set({ algorithm, preserveFormant: algorithm !== 'pv' })} />
      </PropRow>

      <PitchControl semitones={semitones} onChange={(v) => set({ semitones: v })} currentMidi={p.currentMidi} />

      <PropRow label={t('process.length')}>
        {/* 0.5倍と2倍が1倍を中心に対称になるよう対数スケールにする */}
        <Slider
          aria-label={t('process.lengthAria')}
          value={Math.log2(stretch)}
          min={-2}
          max={3}
          step={0.01}
          marks={[-1, 0, 1, 2].map((value) => ({ value }))}
          scale={(v) => 2 ** v}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `×${v.toFixed(2)}`}
          onChange={(_, v) => set({ stretch: round2(2 ** (v as number)) })}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput value={stretch} onChange={(v) => set({ stretch: v })} min={0.25} max={8} step={0.05} unit="×" ariaLabel={t('process.lengthAria')} />
      </PropRow>
      <PropRow>
        {STRETCH_PRESETS.map((v) => (
          <Button key={v} size="small" variant={stretch === v ? 'contained' : 'text'} onClick={() => set({ stretch: v })} sx={SMALL_BUTTON_SX}>
            ×{v}
          </Button>
        ))}
      </PropRow>

      <PropRow label={t('process.formant')}>
        <Switch size="small" checked={preserveFormant} onChange={(e) => set({ preserveFormant: e.target.checked })} slotProps={{ input: { 'aria-label': t('process.formant') } }} />
      </PropRow>
      <PropRow label={t('process.formantShift')}>
        <Slider
          aria-label={t('process.formantShiftAria')}
          disabled={!preserveFormant}
          value={formantSemitones}
          min={-12}
          max={12}
          step={0.1}
          marks={[0].map((value) => ({ value }))}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          onChange={(_, v) => set({ formantSemitones: round2(v as number) })}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput
          value={formantSemitones}
          onChange={(v) => set({ formantSemitones: v })}
          min={-12}
          max={12}
          step={0.1}
          unit={t('process.semitoneUnit')}
          disabled={!preserveFormant}
          ariaLabel={t('process.formantShiftAria')}
        />
      </PropRow>

      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
        {t(p.hasSelection ? 'common.selection' : 'common.whole')}: {formatTime(p.targetDuration)} → <b>{formatTime(p.targetDuration * stretch)}</b>
      </Typography>
      {(p.preview === 'tooLong' || p.preview === 'multi') && !unchanged && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          {t(p.preview === 'tooLong' ? 'play.previewMax' : 'play.previewSingle')}
        </Typography>
      )}
      {busy && <LinearProgress variant="determinate" value={p.progress * 100} aria-label={t('process.progress')} />}

      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={p.preview === 'busy' ? <CircularProgress size={12} color="inherit" /> : <FontAwesomeIcon icon={p.previewPlaying ? faStop : faHeadphones} fontSize={11} />}
          disabled={busy || unchanged || p.preview !== 'ready'}
          onClick={p.onPreview}
          sx={SMALL_BUTTON_SX}
        >
          {t(p.previewPlaying ? 'common.stop' : 'play.preview')}
        </Button>
        <Tooltip title={t('play.loopTooltip')}>
          <span>
            <Button
              size="small"
              variant={p.loopPlaying ? 'contained' : 'outlined'}
              startIcon={<FontAwesomeIcon icon={p.loopPlaying ? faStop : faRepeat} fontSize={11} />}
              disabled={busy || p.preview === 'multi'}
              onClick={p.onLoop}
              sx={SMALL_BUTTON_SX}
            >
              {t(p.loopPlaying ? 'common.stop' : 'play.loop')}
            </Button>
          </span>
        </Tooltip>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={t('common.reset')}>
          <span>
            <IconButton size="small" aria-label={t('common.reset')} disabled={busy || unchanged} onClick={() => set({ semitones: 0, stretch: 1, formantSemitones: 0 })}>
              <FontAwesomeIcon icon={faArrowRotateLeft} fontSize={12} />
            </IconButton>
          </span>
        </Tooltip>
        <Button size="small" variant="contained" disabled={busy || unchanged || p.targetDuration <= 0} onClick={p.onApply} sx={{ ...SMALL_BUTTON_SX, px: 1.5 }}>
          {busy ? t('process.processing', { percent: Math.round(p.progress * 100) }) : t('common.apply')}
        </Button>
      </Stack>
    </InspectorSection>
  )
}
