import type { ReactNode } from 'react'
import { Box, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faCopy, faCropSimple, faPaste, faPause, faPlay, faRepeat, faScissors, faStop, faXmark } from '@fortawesome/free-solid-svg-icons'
import { formatTime } from '../audio/types'
import { SmallButton } from './waveform/WaveformToolbar'
import { useT } from '../i18n/i18n'

interface Props {
  playing: boolean
  position: number
  duration: number
  hasSelection: boolean
  loopPlaying: boolean
  disabled: boolean
  onTogglePlay: () => void
  onStop: () => void
  onPlaySelection: () => void
  onLoop: () => void
  /** 表示ツール（拡大縮小・表示の切替・ピッチ描画） */
  viewTools: ReactNode
  /** 編集（切り取り・コピー・貼り付け・選択範囲のみ残す・選択解除） */
  canEdit: boolean
  hasClipboard: boolean
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onTrim: () => void
  onClearSelection: () => void
}

/** PC 用のツールバー（高さ 40px）。再生操作・再生位置、編集（切り取りなど）、波形の表示ツールを1行に並べる */
export default function Toolbar(p: Props) {
  const t = useT()
  return (
    <Stack
      direction="row"
      spacing={0.5}
      divider={<Divider orientation="vertical" flexItem sx={{ my: 1 }} />}
      sx={{ height: 40, px: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Tooltip title={`${t('play.playPause')} (Space)`}>
          <span>
            <IconButton aria-label={t('play.playPause')} color="primary" size="small" disabled={p.disabled} onClick={p.onTogglePlay}>
              <FontAwesomeIcon icon={p.playing ? faPause : faPlay} />
            </IconButton>
          </span>
        </Tooltip>
        <SmallButton title={t('common.stop')} label={t('common.stop')} icon={faStop} disabled={p.disabled} onClick={p.onStop} />
        <SmallButton title={t('play.playSelection')} label={t('play.playSelection')} icon={faCirclePlay} disabled={p.disabled || !p.hasSelection} onClick={p.onPlaySelection} />
        <SmallButton title={t('play.loopTooltip')} label={t('play.loopPreview')} icon={faRepeat} pressed={p.loopPlaying} disabled={p.disabled} onClick={p.onLoop} />
        <Typography variant="body2" sx={{ fontFamily: 'monospace', ml: 1, minWidth: 150 }}>
          {formatTime(p.position)} / {formatTime(p.duration)}
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <SmallButton title={`${t('edit.cut')} (Ctrl+X)`} label={t('edit.cut')} icon={faScissors} disabled={!p.canEdit || !p.hasSelection} onClick={p.onCut} />
        <SmallButton title={`${t('edit.copy')} (Ctrl+C)`} label={t('edit.copy')} icon={faCopy} disabled={!p.canEdit || !p.hasSelection} onClick={p.onCopy} />
        <SmallButton title={`${t('edit.paste')} (Ctrl+V)`} label={t('edit.paste')} icon={faPaste} disabled={!p.canEdit || !p.hasClipboard} onClick={p.onPaste} />
        <SmallButton title={t('edit.trim')} label={t('edit.trim')} icon={faCropSimple} disabled={!p.canEdit || !p.hasSelection} onClick={p.onTrim} />
        <SmallButton title={`${t('edit.clearSelection')} (Esc)`} label={t('edit.clearSelection')} icon={faXmark} disabled={!p.hasSelection} onClick={p.onClearSelection} />
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        {p.viewTools}
      </Stack>
      <Box sx={{ flexGrow: 1 }} />
    </Stack>
  )
}
