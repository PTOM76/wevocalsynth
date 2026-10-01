import { Box, Tab, Tabs } from '@mui/material'
import { DEFAULT_MIX, isAudible, type Track, type TrackMix } from '../../audio/tracks'
import { MixToggle } from './TrackLanes'
import { useT } from '../../i18n/i18n'
import LevelMeter from '../LevelMeter'

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  disabled: boolean
  onSelect: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  /** トラック `id` のレベルメーター（再生していなければ null） */
  meter: ((id: string) => AnalyserNode | null) | null
}

/** タブで並べるトラック（2本以上のときだけ出す）。下線が選んでいるトラック、右クリックで操作のメニュー */
export default function TrackTabs(p: Props) {
  const t = useT()
  if (p.tracks.length < 2) return null
  return (
    <Box>
      <Tabs
        value={p.activeId}
        onChange={(_, id: string) => !p.disabled && p.onSelect(id)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={t('track.list')}
        sx={{ minHeight: 34, '& .MuiTabs-indicator': { height: 2 } }}
      >
        {p.tracks.map((tr) => {
          const m = p.mix[tr.id] ?? DEFAULT_MIX
          const audible = isAudible(tr.id, p.mix, p.tracks)
          return (
            <Tab
              key={tr.id}
              value={tr.id}
              disabled={p.disabled}
              onContextMenu={(e) => {
                e.preventDefault()
                p.onContextMenu(tr.id, e.clientX, e.clientY)
              }}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                    <Box component="span" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: audible ? 1 : 0.45 }}>
                      {tr.name}
                    </Box>
                    {p.meter && <LevelMeter source={() => p.meter?.(tr.id) ?? null} width={56} height={2} label={t('meter.track', { name: tr.name })} />}
                  </Box>
                  <MixToggle label="M" title={t('track.mute')} on={m.mute} color="warning.main" onClick={() => p.onToggleMute(tr.id)} />
                  <MixToggle label="S" title={t('track.solo')} on={m.solo} color="success.main" onClick={() => p.onToggleSolo(tr.id)} />
                </Box>
              }
              sx={{ minHeight: 34, py: 0.5, px: 1.5, fontSize: 12, textTransform: 'none' }}
            />
          )
        })}
      </Tabs>
    </Box>
  )
}
