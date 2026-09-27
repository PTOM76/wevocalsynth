import { IconButton, Paper, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faPause, faPlay, faRepeat, faStop } from '@fortawesome/free-solid-svg-icons'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'

interface Props {
  playing: boolean
  position: number
  duration: number
  hasSelection: boolean
  loopPlaying: boolean
  onTogglePlay: () => void
  onStop: () => void
  onPlaySelection: () => void
  onLoop: () => void
}

/** スマホ用: 画面下に固定する再生バー（親指で押しやすい位置に大きめのボタンを置く） */
export default function MobilePlayBar(p: Props) {
  const t = useT()
  return (
    <Paper
      square
      elevation={3}
      sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'appBar', pb: 'env(safe-area-inset-bottom)' }}
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
          {formatTime(p.position)} / {formatTime(p.duration)}
        </Typography>
      </Stack>
    </Paper>
  )
}
