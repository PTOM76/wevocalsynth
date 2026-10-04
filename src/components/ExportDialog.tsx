import type { FinishOptions } from '../audio/finish'
import { useEffect, useState, type ReactNode } from 'react'
import { Box, Checkbox, FormControlLabel,
  Button,
  DialogActions,
  DialogContent,
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
import { enterToSubmit, WindowDialog } from 'pevenmui'
import { EXPORT_EXT, MP3_SAMPLE_RATES, OPUS_SAMPLE_RATE, canEncodeOpus, type ExportFormat, type WavFormat } from 'wevocal-lib'
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
  /** 全トラックを混ぜて書き出す（偽なら選んでいるトラックだけ）。ミュート・ソロとフェーダーに従う */
  mix: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  baseName: string
  sourceRate: number
  sourceChannels: number
  hasSelection: boolean
  /** トラックの数（2本以上なら「書き出す対象」を出す） */
  trackCount: number
  busy: boolean
  progress: number
  /** win は操作したウィンドウ（ダイアログを別ウィンドウで開いているとき、保存先の画面をそこから出すため） */
  onExport: (s: ExportSettings, win?: Window | null) => void
  /** 保存先のフォルダー（PWA。書き出すときに保存先を聞かず、ここへ保存する）。選び直しは `win` の窓から出す */
  folder?: { name: string | null; choose: (win: Window | null) => void }
  /** 選んでいるトラックだけを対象にして開く（トラックの右クリックから） */
  activeOnly?: boolean
  /** 仕上げ（ノーマライズ、両端のフェード）。設定に覚える */
  finish: FinishOptions
  onFinishChange: (f: FinishOptions) => void
}

/** 両端のフェードの長さの選択肢（ms。0 はなし） */
const FADES = [0, 5, 10, 20, 50]

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
    mix: true,
  })
  const [opusOk, setOpusOk] = useState(false)
  const set = (patch: Partial<ExportSettings>) => setS((v) => ({ ...v, ...patch }))

  // 開くたびにファイル名と範囲を今の状態に合わせ、Opus が使えるかを確かめる
  useEffect(() => {
    if (!p.open) return
    setS((v) => ({ ...v, fileName: p.baseName, selectionOnly: p.hasSelection, ...(p.activeOnly ? { mix: false } : {}) }))
    void canEncodeOpus(Math.min(2, p.sourceChannels)).then(setOpusOk)
  }, [p.open, p.baseName, p.hasSelection, p.sourceChannels, p.activeOnly])

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
    <WindowDialog
      open={p.open}
      onClose={p.busy ? undefined : p.onClose}
      title={t('export.title')}
      name="export"
      width={444}
      height={600}
      dialogProps={{ fullWidth: true, maxWidth: 'xs' }}
      onKeyDown={(e) => {
        const win = e.currentTarget.ownerDocument.defaultView
        enterToSubmit(() => p.onExport({ ...s, sampleRate: rate, kbps }, win), !p.busy && !!s.fileName.trim())(e)
      }}
    >
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
          {p.trackCount > 1 && (
            <Choice
              label={t('export.target')}
              value={s.mix ? 'mix' : 'active'}
              onChange={(v) => set({ mix: v === 'mix' })}
              options={[
                ['mix', t('export.targetMix')],
                ['active', t('export.targetActive')],
              ]}
            />
          )}
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
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FormControlLabel
              sx={{ flex: 1, m: 0 }}
              control={<Checkbox size="small" checked={p.finish.normalize} onChange={(e) => p.onFinishChange({ ...p.finish, normalize: e.target.checked })} />}
              label={<Typography sx={{ fontSize: 13 }}>{t('volume.normalize')}</Typography>}
            />
            <Box sx={{ width: 150 }}>
              <Choice
                label={t('export.fade')}
                value={p.finish.fadeMs}
                onChange={(v) => p.onFinishChange({ ...p.finish, fadeMs: v })}
                options={FADES.map((ms): [number, string] => [ms, ms ? `${ms} ms` : t('export.fadeNone')])}
              />
            </Box>
          </Stack>
          {p.folder && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t('export.folder')}: {p.folder.name ?? t('export.folderUnset')}
              </Typography>
              <Button size="small" disabled={p.busy} onClick={(e) => p.folder?.choose(e.currentTarget.ownerDocument.defaultView)}>
                {t('export.folderChange')}
              </Button>
            </Stack>
          )}
          {p.busy && <LinearProgress variant="determinate" value={p.progress * 100} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose} disabled={p.busy}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={p.busy || !s.fileName.trim()}
          onClick={(e) => p.onExport({ ...s, sampleRate: rate, kbps }, e.currentTarget.ownerDocument.defaultView)}
        >
          {t('export.run')}
        </Button>
      </DialogActions>
    </WindowDialog>
  )
}
