import type { ReactNode } from 'react'
import { Box, Button, Chip, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faCirclePlay,
  faCopy,
  faCropSimple,
  faPaste,
  faPause,
  faPlay,
  faScissors,
  faStop,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import type { Clip, Range } from '../audio/types'
import { formatTime } from './Waveform'

export type Source = 'edited' | 'original'

/** ファイル名・形式・加工後/原音の切替 */
export function ClipInfo(props: {
  fileName: string
  clip: Clip
  duration: number
  source: Source
  onSourceChange: (s: Source) => void
}) {
  const { fileName, clip, duration, source, onSourceChange } = props
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 500 }} noWrap>
        {fileName}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Chip size="small" label={`${clip.sampleRate} Hz`} />
        <Chip size="small" label={clip.channels.length === 1 ? 'Mono' : `${clip.channels.length} ch`} />
        <Chip size="small" label={formatTime(duration)} />
      </Stack>
      <ToggleButtonGroup size="small" exclusive value={source} onChange={(_, v: Source | null) => v && onSourceChange(v)}>
        <ToggleButton value="edited">加工後</ToggleButton>
        <ToggleButton value="original">原音</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

/** ツールチップ付きのアイコンボタン（無効時もツールチップを出すため span で包む） */
function ToolButton(props: { title: string; label: string; icon: IconDefinition; disabled?: boolean; onClick: () => void }) {
  return (
    <Tooltip title={props.title}>
      <span>
        <IconButton aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>
          <FontAwesomeIcon icon={props.icon} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

interface Props {
  playing: boolean
  position: number
  duration: number
  selection: Range | null
  /** 選択範囲の入力と編集ボタンを出すか（原音表示中は出さない） */
  editable: boolean
  busy: boolean
  hasClipboard: boolean
  onTogglePlay: () => void
  onStop: () => void
  onPlaySelection: () => void
  onSelectionChange: (r: Range | null) => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onTrim: () => void
}

/** 再生操作・再生位置・選択範囲の入力・切り取りなどの編集ボタン */
export function TransportBar(p: Props) {
  const setField = (key: keyof Range, value: string) => {
    const v = Number(value)
    if (!Number.isFinite(v)) return
    const cur = p.selection ?? { start: 0, end: p.duration }
    const next = { ...cur, [key]: Math.max(0, Math.min(p.duration, v)) }
    p.onSelectionChange(next.end > next.start ? next : null)
  }
  const field = (key: keyof Range, label: string): ReactNode => (
    <TextField
      size="small"
      type="number"
      label={label}
      value={p.selection ? +p.selection[key].toFixed(3) : ''}
      onChange={(e) => setField(key, e.target.value)}
      slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
      sx={{ width: 120 }}
    />
  )
  const noSel = !p.selection || p.busy

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Tooltip title="再生 / 一時停止 (Space)">
          <IconButton aria-label="再生 / 一時停止" color="primary" onClick={p.onTogglePlay}>
            <FontAwesomeIcon icon={p.playing ? faPause : faPlay} />
          </IconButton>
        </Tooltip>
        <ToolButton title="停止" label="停止" icon={faStop} onClick={p.onStop} />
        <Button
          startIcon={<FontAwesomeIcon icon={faCirclePlay} />}
          disabled={!p.selection || !p.editable}
          onClick={p.onPlaySelection}
        >
          範囲を試聴
        </Button>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 170 }}>
          {formatTime(p.position)} / {formatTime(p.duration)}
        </Typography>
      </Stack>
      <Box sx={{ flexGrow: 1 }} />
      {p.editable && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {field('start', '開始')}
          {field('end', '終了')}
          <ToolButton title="切り取り (Ctrl+X)" label="切り取り" icon={faScissors} disabled={noSel} onClick={p.onCut} />
          <ToolButton title="コピー (Ctrl+C)" label="コピー" icon={faCopy} disabled={noSel} onClick={p.onCopy} />
          <ToolButton
            title="再生位置に貼り付け (Ctrl+V)"
            label="再生位置に貼り付け"
            icon={faPaste}
            disabled={!p.hasClipboard || p.busy}
            onClick={p.onPaste}
          />
          <ToolButton title="選択範囲のみ残す" label="選択範囲のみ残す" icon={faCropSimple} disabled={noSel} onClick={p.onTrim} />
          <ToolButton
            title="選択解除"
            label="選択解除"
            icon={faXmark}
            disabled={!p.selection}
            onClick={() => p.onSelectionChange(null)}
          />
        </Stack>
      )}
    </Stack>
  )
}
