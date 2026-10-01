import { useEffect, useState, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import type { WavFormat } from '../audio/wav'
import { EXPORT_EXT, type ExportFormat } from '../audio/export/exportAudio'
import { MP3_SAMPLE_RATES, OPUS_SAMPLE_RATE, canEncodeOpus } from '../audio/export/formats'
import { useT } from '../i18n/i18n'

/** ダイアログで選んだ設定（範囲は「選択範囲か全体か」だけを持つ） */
export interface ExportSettings {
  fileName: string
  format: ExportFormat
  wavFormat: WavFormat
  kbps: number
  /** 0 は元のサンプルレート */
  sampleRate: number
  mono: boolean
  selectionOnly: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  baseName: string
  sourceRate: number
  sourceChannels: number
  hasSelection: boolean
  busy: boolean
  progress: number
  onExport: (s: ExportSettings) => void
}

const BITRATES: Record<'mp3' | 'opus', number[]> = {
  mp3: [96, 128, 160, 192, 256, 320],
  opus: [64, 96, 128, 160, 192, 256],
}
const RATES = [22050, 32000, 44100, 48000, 96000]

/** ラベル付きのセレクトボックス */
function Choice<T extends string | number>(p: { label: string; value: T; options: [T, ReactNode][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <FormControl size="small" fullWidth disabled={p.disabled}>
      <InputLabel>{p.label}</InputLabel>
      <Select label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map(([v, text]) => (
          <MenuItem key={v} value={v}>
            {text}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

/** 音声ファイルの書き出し。形式・音質・サンプルレート・チャンネル・範囲を選ぶ */
export default function ExportDialog(p: Props) {
  const t = useT()
  const [s, setS] = useState<ExportSettings>({
    fileName: '',
    format: 'wav',
    wavFormat: 'pcm16',
    kbps: 192,
    sampleRate: 0,
    mono: false,
    selectionOnly: false,
  })
  const [opusOk, setOpusOk] = useState(false)
  const set = (patch: Partial<ExportSettings>) => setS((v) => ({ ...v, ...patch }))

  // 開くたびにファイル名と範囲を今の状態に合わせ、Opus が使えるかを確かめる
  useEffect(() => {
    if (!p.open) return
    setS((v) => ({ ...v, fileName: `${p.baseName}_wevocal`, selectionOnly: p.hasSelection && v.selectionOnly }))
    void canEncodeOpus(Math.min(2, p.sourceChannels)).then(setOpusOk)
  }, [p.open, p.baseName, p.hasSelection, p.sourceChannels])

  // 形式ごとに選べるサンプルレートが違う（MP3 は 32/44.1/48kHz、Opus は 48kHz 固定）
  const rateOptions: [number, string][] =
    s.format === 'opus'
      ? [[OPUS_SAMPLE_RATE, '48000 Hz']]
      : [
          ...(s.format === 'wav' || MP3_SAMPLE_RATES.includes(p.sourceRate)
            ? [[0, t('export.originalRate', { rate: p.sourceRate })] as [number, string]]
            : []),
          ...(s.format === 'mp3' ? MP3_SAMPLE_RATES : RATES).map((r): [number, string] => [r, `${r} Hz`]),
        ]
  const rate = rateOptions.some(([v]) => v === s.sampleRate) ? s.sampleRate : rateOptions[0][0]
  const lossy = s.format !== 'wav'
  const kbpsOptions = lossy ? BITRATES[s.format as 'mp3' | 'opus'] : []
  const kbps = kbpsOptions.includes(s.kbps) ? s.kbps : 128

  return (
    <Dialog open={p.open} onClose={p.busy ? undefined : p.onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('export.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={s.format}
            onChange={(_, v: ExportFormat | null) => v && set({ format: v })}
          >
            <ToggleButton value="wav">WAV</ToggleButton>
            <ToggleButton value="mp3">MP3</ToggleButton>
            <ToggleButton value="opus" disabled={!opusOk}>
              Opus
            </ToggleButton>
          </ToggleButtonGroup>
          {!opusOk && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: '4px !important' }}>
              {t('export.opusUnsupported')}
            </Typography>
          )}

          {s.format === 'wav' ? (
            <Choice
              label={t('export.sampleFormat')}
              value={s.wavFormat}
              onChange={(v) => set({ wavFormat: v })}
              options={[
                ['pcm16', '16-bit PCM'],
                ['pcm24', '24-bit PCM'],
                ['float32', '32-bit float'],
              ]}
            />
          ) : (
            <Choice
              label={t('export.bitrate')}
              value={kbps}
              onChange={(v) => set({ kbps: v })}
              options={kbpsOptions.map((k) => [k, `${k} kbps`])}
            />
          )}
          <Choice
            label={t('export.sampleRate')}
            value={rate}
            onChange={(v) => set({ sampleRate: v })}
            options={rateOptions}
            disabled={s.format === 'opus'}
          />
          <Choice
            label={t('export.channels')}
            value={s.mono ? 'mono' : 'keep'}
            onChange={(v) => set({ mono: v === 'mono' })}
            options={[
              ['keep', p.sourceChannels === 1 ? 'Mono' : t('export.keepChannels', { n: p.sourceChannels })],
              ['mono', 'Mono'],
            ]}
          />
          <Choice
            label={t('export.range')}
            value={s.selectionOnly ? 'selection' : 'whole'}
            onChange={(v) => set({ selectionOnly: v === 'selection' })}
            options={[
              ['whole', t('common.whole')],
              ['selection', t('common.selection')],
            ]}
            disabled={!p.hasSelection}
          />
          <TextField
            size="small"
            label={t('export.fileName')}
            value={s.fileName}
            onChange={(e) => set({ fileName: e.target.value })}
            slotProps={{ input: { endAdornment: <Typography color="text.secondary">{EXPORT_EXT[s.format]}</Typography> } }}
          />
          {p.busy && <LinearProgress variant="determinate" value={p.progress * 100} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose} disabled={p.busy}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={p.busy || !s.fileName.trim()}
          onClick={() => p.onExport({ ...s, sampleRate: rate, kbps })}
        >
          {t('export.run')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
