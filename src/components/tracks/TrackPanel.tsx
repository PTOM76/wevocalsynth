import { Box, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import type { Track, TrackMix } from '../../audio/tracks'
import type { View } from '../waveform/draw'
import { usePersistentNumber } from '../layout/Splitter'
import TrackLanes from './TrackLanes'
import TrackTabs from './TrackTabs'
import { useT } from '../../i18n/i18n'

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  view: View
  disabled: boolean
  onSelect: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
}

/** 折りたたみの状態を覚えておくキー（1: 広げる / 2: 折りたたむ。usePersistentNumber は 0 を覚えられない） */
const KEY = 'wevocalsynth.tracksCollapsed'

/**
 * トラックの欄（2本以上のときだけ出す）。広げると波形付きの一覧、折りたたむとタブになる。
 * 右端のボタンで切り替え、状態は次に開いたときも引き継ぐ
 */
export default function TrackPanel(p: Props) {
  const t = useT()
  const [state, setState] = usePersistentNumber(KEY, 1)
  if (p.tracks.length < 2) return null
  const collapsed = state === 2
  const { view, ...rest } = p
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{collapsed ? <TrackTabs {...rest} /> : <TrackLanes {...rest} view={view} />}</Box>
      <Tooltip title={t(collapsed ? 'track.expand' : 'track.collapse')}>
        <IconButton
          size="small"
          aria-label={t(collapsed ? 'track.expand' : 'track.collapse')}
          aria-expanded={!collapsed}
          onClick={() => setState(collapsed ? 1 : 2)}
          sx={{ m: 0.25, flexShrink: 0 }}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronDown : faChevronUp} style={{ fontSize: 12 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
