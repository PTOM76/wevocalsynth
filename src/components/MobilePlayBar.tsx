import { IconButton, Paper, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faPause, faPlay, faRepeat, faStop } from '@fortawesome/free-solid-svg-icons'
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
        <IconButton aria-label={t('play.loopPreview')} color={p.loopPlaying ? 'primary' : 'default'} onClick={p.onLoop}>
          <FontAwesomeIcon icon={faRepeat} />
        </IconButton>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', ml: 'auto' }}>
          <LiveTime position={p.position} playing={p.playing} livePosition={p.livePosition} duration={p.duration} />
        </Typography>
      </Stack>
    </Paper>
  )
}
