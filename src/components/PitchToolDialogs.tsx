import { useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Typography,
} from '@mui/material'
import { rateForBpm, type SnapOptions, type VibratoOptions } from '../audio/pitchTools'
import { noteName } from '../audio/notes'
import { COMPACT_SLIDER_SX, NumberInput } from './inspector/Inspector'
import { useT } from '../i18n/i18n'

/** 揃え先に選べる音（C2〜C6） */
const NOTES = Array.from({ length: 49 }, (_, i) => 36 + i)

/** ラベル・スライダー・数値欄の1行 */
export function SliderRow(p: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography sx={{ fontSize: 13, width: 72, flexShrink: 0 }}>{p.label}</Typography>
      <Slider aria-label={p.label} value={p.value} min={p.min} max={p.max} step={p.step} onChange={(_, v) => p.onChange(v as number)} sx={COMPACT_SLIDER_SX} />
      <NumberInput value={p.value} onChange={p.onChange} min={p.min} max={p.max} step={p.step} unit={p.unit} ariaLabel={p.label} />
    </Box>
  )
}

/** 共通の枠: タイトル・対象範囲の表示・「作成」「キャンセル」 */
export function ToolDialog(p: { open: boolean; title: string; hasSelection: boolean; onClose: () => void; onRun: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{p.title}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {t('pitchTool.target', { range: t(p.hasSelection ? 'common.selection' : 'common.whole') })}
        </Typography>
        {p.children}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t('pitchTool.hint')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button
          size="small"
          onClick={() => {
            p.onRun()
            p.onClose()
          }}
        >
          {t('pitchTool.create')}
        </Button>
        <Button size="small" onClick={p.onClose}>
          {t('common.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export interface DialogProps<O> {
  open: boolean
  hasSelection: boolean
  onClose: () => void
  onRun: (o: O) => void
}

/** ビブラートを加える。速さの初期値は設定の BPM に合わせる */
export function VibratoDialog(p: DialogProps<VibratoOptions> & { bpm: number }) {
  const t = useT()
  const [o, setO] = useState<VibratoOptions>(() => ({ depth: 0.5, rate: rateForBpm(p.bpm), delay: 0.2 }))
  const set = (patch: Partial<VibratoOptions>) => setO((v) => ({ ...v, ...patch }))
  return (
    <ToolDialog open={p.open} title={t('vibrato.title')} hasSelection={p.hasSelection} onClose={p.onClose} onRun={() => p.onRun(o)}>
      <SliderRow label={t('vibrato.depth')} value={o.depth} onChange={(v) => set({ depth: v })} min={0} max={2} step={0.05} unit={t('process.semitoneUnit')} />
      <SliderRow label={t('vibrato.rate')} value={o.rate} onChange={(v) => set({ rate: v })} min={2} max={10} step={0.1} unit="Hz" />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
        <Button size="small" onClick={() => set({ rate: rateForBpm(p.bpm) })} sx={{ fontSize: 12 }}>
          {t('vibrato.syncBpm', { bpm: p.bpm })}
        </Button>
      </Box>
      <SliderRow label={t('vibrato.delay')} value={o.delay} onChange={(v) => set({ delay: v })} min={0} max={1} step={0.05} unit={t('vibrato.secondUnit')} />
    </ToolDialog>
  )
}

/** 音程に揃える（音ごとに近い半音へ、または指定した音へ） */
export function SnapDialog(p: DialogProps<SnapOptions>) {
  const t = useT()
  const [o, setO] = useState<SnapOptions>({ mode: 'nearest', note: 60, keepShape: true, strength: 1 })
  const set = (patch: Partial<SnapOptions>) => setO((v) => ({ ...v, ...patch }))
  return (
    <ToolDialog open={p.open} title={t('snap.title')} hasSelection={p.hasSelection} onClose={p.onClose} onRun={() => p.onRun(o)}>
      <RadioGroup value={o.mode} onChange={(e) => set({ mode: e.target.value as SnapOptions['mode'] })}>
        <FormControlLabel value="nearest" control={<Radio size="small" />} label={t('snap.nearest')} slotProps={{ typography: { sx: { fontSize: 13 } } }} />
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControlLabel value="note" control={<Radio size="small" />} label={t('snap.note')} slotProps={{ typography: { sx: { fontSize: 13 } } }} />
          <Select
            size="small"
            value={o.note}
            disabled={o.mode !== 'note'}
            onChange={(e) => set({ note: Number(e.target.value) })}
            sx={{ fontSize: 13, minWidth: 90, '& .MuiSelect-select': { py: 0.5 } }}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 300 } } } }}
          >
            {NOTES.map((m) => (
              <MenuItem key={m} value={m} sx={{ fontSize: 13 }}>
                {noteName(m)}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </RadioGroup>
      <FormControlLabel
        control={<Checkbox size="small" checked={o.keepShape} onChange={(e) => set({ keepShape: e.target.checked })} />}
        label={t('snap.keepShape')}
        slotProps={{ typography: { sx: { fontSize: 13 } } }}
      />
      <SliderRow label={t('snap.strength')} value={Math.round(o.strength * 100)} onChange={(v) => set({ strength: v / 100 })} min={0} max={100} step={1} unit="%" />
    </ToolDialog>
  )
}
