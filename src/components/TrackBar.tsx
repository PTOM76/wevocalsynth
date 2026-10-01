import { Box, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_MIX, isAudible, type Track, type TrackMix } from '../audio/tracks'
import { useT } from '../i18n/i18n'

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  disabled: boolean
  onSelect: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  onRemove: (id: string) => void
}

/** M / S の小さな切り替え（オンなら色を付ける） */
function Toggle(p: { label: string; title: string; on: boolean; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <Tooltip title={p.title}>
      <ButtonBase
        aria-label={p.title}
        aria-pressed={p.on}
        disabled={p.disabled}
        onClick={p.onClick}
        sx={{
          width: 18,
          height: 18,
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 0.5,
          border: 1,
          borderColor: p.on ? p.color : 'divider',
          bgcolor: p.on ? p.color : 'transparent',
          color: p.on ? 'common.white' : 'text.secondary',
        }}
      >
        {p.label}
      </ButtonBase>
    </Tooltip>
  )
}

/**
 * トラックの帯（2本以上のときだけ出す）。名前を押すとそのトラックを編集し、M / S で鳴らし方を変える。
 * 編集できるのは選んでいるトラックだけで、ほかのトラックは再生のときに一緒に鳴る
 */
export default function TrackBar(p: Props) {
  const t = useT()
  if (p.tracks.length < 2) return null
  return (
    <Box
      role="tablist"
      aria-label={t('track.list')}
      sx={{ display: 'flex', gap: 0.75, px: 1, py: 0.5, overflowX: 'auto', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
    >
      {p.tracks.map((tr) => {
        const m = p.mix[tr.id] ?? DEFAULT_MIX
        const selected = tr.id === p.activeId
        const audible = isAudible(tr.id, p.mix, p.tracks)
        return (
          <Box
            key={tr.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              pl: 1,
              pr: 0.25,
              height: 28,
              flexShrink: 0,
              borderRadius: 0.5,
              border: 1,
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'action.selected' : 'transparent',
              // 鳴らないトラックは薄く出す
              opacity: audible ? 1 : 0.5,
            }}
          >
            <ButtonBase role="tab" aria-selected={selected} disabled={p.disabled} onClick={() => p.onSelect(tr.id)} sx={{ maxWidth: 200 }}>
              <Typography sx={{ fontSize: 12, fontWeight: selected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tr.name}
              </Typography>
            </ButtonBase>
            <Toggle label="M" title={t('track.mute')} on={m.mute} color="warning.main" disabled={false} onClick={() => p.onToggleMute(tr.id)} />
            <Toggle label="S" title={t('track.solo')} on={m.solo} color="success.main" disabled={false} onClick={() => p.onToggleSolo(tr.id)} />
            <Tooltip title={t('track.remove')}>
              <span>
                <IconButton size="small" aria-label={t('track.remove')} disabled={p.disabled} onClick={() => p.onRemove(tr.id)} sx={{ p: 0.25 }}>
                  <FontAwesomeIcon icon={faXmark} style={{ fontSize: 11 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )
      })}
    </Box>
  )
}
