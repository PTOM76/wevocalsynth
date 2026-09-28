import { useState } from 'react'
import { Box, Button, Slider, Typography } from '@mui/material'
import type { VibratoOptions } from '../audio/vibrato'
import { COMPACT_SLIDER_SX, InspectorSection, NumberInput, PropRow } from './inspector/Inspector'
import { useT } from '../i18n/i18n'

interface Props {
  hasSelection: boolean
  /** ピッチ（F0）を解析済みか。まだなら「加える」「平らにする」で解析を始める */
  pitchReady: boolean
  /** 加えた・平らにした曲線（ピッチ帯の青い線）があるか */
  hasCurve: boolean
  busy: boolean
  onAdd: (o: VibratoOptions) => void
  onFlatten: () => void
  onApply: () => void
  onDiscard: () => void
}

const SMALL_BUTTON_SX = { minWidth: 0, height: 26, px: 1, fontSize: 12 } as const

/**
 * インスペクタの「ビブラート」。選択範囲のピッチにビブラートを重ねる、または元の揺れを平らにする。
 * 結果はピッチ帯に曲線として出し、「適用」でピッチカーブ編集と同じ処理で音に反映する
 */
export default function VibratoPanel(p: Props) {
  const t = useT()
  const [o, setO] = useState<VibratoOptions>({ depth: 0.5, rate: 5.5, delay: 0.2 })
  const set = (patch: Partial<VibratoOptions>) => setO((v) => ({ ...v, ...patch }))

  const row = (label: string, key: keyof VibratoOptions, min: number, max: number, step: number, unit: string) => (
    <PropRow label={label}>
      <Slider
        aria-label={label}
        value={o[key]}
        min={min}
        max={max}
        step={step}
        valueLabelDisplay="auto"
        onChange={(_, v) => set({ [key]: v as number })}
        sx={COMPACT_SLIDER_SX}
      />
      <NumberInput value={o[key]} onChange={(v) => set({ [key]: v })} min={min} max={max} step={step} unit={unit} ariaLabel={label} />
    </PropRow>
  )

  return (
    <InspectorSection title={t('vibrato.title')} extra={t(p.hasSelection ? 'common.selection' : 'common.whole')}>
      {row(t('vibrato.depth'), 'depth', 0, 2, 0.05, t('process.semitoneUnit'))}
      {row(t('vibrato.rate'), 'rate', 2, 10, 0.1, 'Hz')}
      {row(t('vibrato.delay'), 'delay', 0, 1, 0.05, t('vibrato.secondUnit'))}
      {!p.pitchReady && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t('vibrato.needsPitch')}</Typography>}
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <Button size="small" variant="outlined" disabled={p.busy} onClick={() => p.onAdd(o)} sx={SMALL_BUTTON_SX}>
          {t('vibrato.add')}
        </Button>
        <Button size="small" variant="outlined" disabled={p.busy} onClick={p.onFlatten} sx={SMALL_BUTTON_SX}>
          {t('vibrato.flatten')}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" disabled={p.busy || !p.hasCurve} onClick={p.onDiscard} sx={SMALL_BUTTON_SX}>
          {t('vibrato.discard')}
        </Button>
        <Button size="small" variant="contained" disabled={p.busy || !p.hasCurve} onClick={p.onApply} sx={{ ...SMALL_BUTTON_SX, px: 1.5 }}>
          {t('common.apply')}
        </Button>
      </Box>
    </InspectorSection>
  )
}
