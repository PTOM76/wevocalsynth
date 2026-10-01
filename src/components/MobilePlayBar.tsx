import type { ReactNode } from 'react'
import { Box, IconButton, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faPause, faPlay, faRepeat, faStop, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../i18n/i18n'
import LiveTime from './LiveTime'

interface Props {
  playing: boolean
  position: number
  /** 再生中の今の位置（時間表示が自分で読む） */
  livePosition: () => number
  duration: number
  hasSelection: boolean
  loopPlaying: boolean
  onTogglePlay: () => void
  onStop: () => void
  onPlaySelection: () => void
  onLoop: () => void
  /** 全体のレベルメーター（再生時間の下に置く） */
  meter?: ReactNode
  /** 処理中なら、その内容と進捗（0〜1）と中断。スマホにはステータスバーが無いので、ここに出す */
  task?: { label: string; progress: number; onCancel: () => void } | null
}

/** スマホ用: 画面下の再生バー（親指で押しやすい位置に大きめのボタンを置く）。画面の縦の並びの最後に置く */
export default function MobilePlayBar(p: Props) {
  const t = useT()
  return (
    <Paper
      square
      elevation={0}
      sx={{ pb: 'env(safe-area-inset-bottom)', borderTop: 1, borderColor: 'divider' }}
    >
      {p.task && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, pt: 0.75 }}>
          <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{p.task.label}</Typography>
          <LinearProgress variant={p.task.progress < 0 ? 'indeterminate' : 'determinate'} value={Math.max(0, p.task.progress) * 100} sx={{ flex: 1 }} />
          {p.task.progress >= 0 && <Typography sx={{ fontSize: 12 }}>{Math.round(p.task.progress * 100)}%</Typography>}
          <IconButton aria-label={t('task.cancel')} onClick={p.task.onCancel} sx={{ p: 0.75 }}>
            <FontAwesomeIcon icon={faXmark} style={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5 }}>
        <IconButton aria-label={t('play.playPause')} color="primary" size="large" onClick={p.onTogglePlay}>
          <FontAwesomeIcon icon={p.playing ? faPause : faPlay} />
        </IconButton>
        <IconButton aria-label={t('common.stop')} onClick={p.onStop}>
          <FontAwesomeIcon icon={faStop} />
        </IconButton>
        <IconButton aria-label={t('play.playSelection')} disabled={!p.hasSelection} onClick={p.onPlaySelection}>
          <FontAwesomeIcon icon={faCirclePlay} />
        </IconButton>
        <IconButton aria-label={t('play.repeat')} color={p.loopPlaying ? 'primary' : 'default'} onClick={p.onLoop}>
          <FontAwesomeIcon icon={faRepeat} />
        </IconButton>
        <Box sx={{ ml: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            <LiveTime position={p.position} playing={p.playing} livePosition={p.livePosition} duration={p.duration} />
          </Typography>
          {p.meter}
        </Box>
      </Stack>
    </Paper>
  )
}
