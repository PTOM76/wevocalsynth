import PresetMenu, { type Preset } from './PresetMenu'
import { useState } from 'react'
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
import { isInstrumentAlgorithm, modeOf, type Mode, type ModeSettings } from '../audio/detectMode'
import type { PreviewState } from '../hooks/usePreview'
import { formatTime } from '../audio/types'
import PitchControl from './PitchControl'
import AlgorithmMenu from './AlgorithmMenu'
import { COMPACT_SLIDER_SX, InspectorSection, NumberInput, PropRow, useDoubleClickReset } from './inspector/Inspector'
import { useT, type MessageKey } from '../i18n/i18n'
import { countRender } from '../debug/debugStats'
import { stableMemo } from './stableMemo'

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
  /** ボーカル・楽器のモードで使う処理方式（設定の既定値） */
  modes: ModeSettings
  /** 従来の処理方式（改良版があるもの）も「…」に出す */
  showLegacyAlgorithms: boolean
  /** 拍数に合わせるときの基準: プロジェクトの BPM と、範囲（最後に選んだもの、なければ全体）の長さ（秒） */
  bpm: number
  rangeSec: number
  /** 加工のプリセット */
  presets: Preset[]
  onPresetsChange: (presets: Preset[]) => void
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
function EditPanel(p: Props) {
  countRender('EditPanel')
  const { params, onChange, busy } = p
  const { semitones, stretch, preserveFormant, formantSemitones } = params
  const t = useT()
  const set = (patch: Partial<EditParams>) => onChange({ ...params, ...patch })
  const unchanged = semitones === 0 && stretch === 1 && !(preserveFormant && formantSemitones !== 0)
  const mode: Mode = modeOf(params.algorithm, p.modes)
  // ダブルクリックで既定値（長さ ×1、フォルマントの高さ 0）に戻す（設定で有効なときだけ）
  const resetStretch = useDoubleClickReset(() => set({ stretch: 1 }))
  const resetFormant = useDoubleClickReset(() => set({ formantSemitones: 0 }))
  // 拍数に合わせる（長さの欄に倍率を入れるだけ。試聴・適用はいつもどおり）
  const [beats, setBeats] = useState(1)
  const canFit = p.bpm > 0 && p.rangeSec > 0
  const fitBeats = () => {
    if (!canFit) return
    const ratio = (beats * 60) / p.bpm / p.rangeSec
    // 長さの欄の範囲（×0.25〜×8）に収める
    set({ stretch: Math.round(Math.min(8, Math.max(0.25, ratio)) * 10000) / 10000 })
  }

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
          onChange={(_, v: Mode | null) => v && set(p.modes[v])}
          sx={{ '& .MuiToggleButton-root': { height: 24, fontSize: 12, py: 0 } }}
        >
          {(['vocal', 'instrument'] as const).map((m) => (
            <Tooltip key={m} title={t(MODE_HINT[m])}>
              <ToggleButton value={m}>{t(m === 'vocal' ? 'common.vocal' : 'common.instrument')}</ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
        <AlgorithmMenu value={params.algorithm} defaults={[p.modes.vocal.algorithm, p.modes.instrument.algorithm]} showLegacy={p.showLegacyAlgorithms} onChange={(algorithm) => set({ algorithm, preserveFormant: !isInstrumentAlgorithm(algorithm) })} />
      </PropRow>

      <PropRow label={t('preset.label')}>
        <PresetMenu params={params} presets={p.presets} onApply={onChange} onChange={p.onPresetsChange} disabled={busy} />
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
          {...resetStretch}
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
      {/* 拍数に合わせる: 範囲の長さがその拍数（プロジェクトの BPM）になる倍率を、長さに入れる */}
      <PropRow label={t('process.fitBeats')}>
        <NumberInput value={beats} onChange={setBeats} min={0.25} max={64} step={0.25} unit={t('process.beatUnit')} ariaLabel={t('process.fitBeats')} />
        <Button size="small" variant="outlined" disabled={!canFit} onClick={fitBeats} sx={SMALL_BUTTON_SX}>
          {t('process.fit')}
        </Button>
      </PropRow>

      {/* フォルマントは「保持」と「高さ」の2行をまとめ、何の設定かを見出しで示す */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', pt: 0.5 }}>{t('process.formantGroup')}</Typography>
      <PropRow label={t('process.formantKeep')}>
        <Switch size="small" checked={preserveFormant} onChange={(e) => set({ preserveFormant: e.target.checked })} slotProps={{ input: { 'aria-label': t('process.formant') } }} />
      </PropRow>
      <PropRow label={t('process.formantShift')}>
        <Tooltip title={t('process.formantShiftHint')} placement="top">
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
          {...resetFormant}
          sx={COMPACT_SLIDER_SX}
        />
        </Tooltip>
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
      {busy && <LinearProgress variant={p.progress < 0 ? 'indeterminate' : 'determinate'} value={Math.max(0, p.progress) * 100} aria-label={t('process.progress')} />}

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
          {busy ? t('process.processing', { percent: Math.round(Math.max(0, p.progress) * 100) }) : t('common.apply')}
        </Button>
      </Stack>
    </InspectorSection>
  )
}

// 関数の props が作り直されても、ほかが同じなら描き直さない
export default stableMemo(EditPanel)
