import { Box, Tab, Tabs, Tooltip } from '@mui/material'
import { DEFAULT_MIX, isAudible, type Track, type TrackFader, type TrackMix } from '../../audio/tracks'
import { MixToggle } from './TrackLanes'
import { useT } from '../../i18n/i18n'
import { LevelMeter, usePalette } from 'pevenmui'
import { pickMods, useTrackDrag, type PickMods } from './useTrackDrag'

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  disabled: boolean
  /** 押したトラック。修飾キーがあれば複数選択（`picked`）を変える */
  onSelect: (id: string, mods: PickMods) => void
  /** 複数選んでいるトラック（右クリックメニューの対象） */
  picked: ReadonlySet<string>
  /** ドラッグでの並び替え */
  onMove: (id: string, to: number) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  /** 位相の反転（フェーダーの invert）と、その切り替え */
  faders: Record<string, TrackFader>
  onToggleInvert: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  /** トラック `id` のレベルメーター（再生していなければ null） */
  meter: ((id: string) => AnalyserNode | null) | null
}

/** タブで並べるトラック（2本以上のときだけ出す）。下線が選んでいるトラック、右クリックで操作のメニュー */
export default function TrackTabs(p: Props) {
  const t = useT()
  const { pal } = usePalette()
  const drag = useTrackDrag(p.tracks, 'x', p.disabled, p.onMove)
  if (p.tracks.length < 2) return null
  return (
    // 収まらないときは、マウスのホイール（縦）でも横に動かせる
    <Box
      onWheel={(e) => {
        const scroller = e.currentTarget.querySelector<HTMLElement>('.MuiTabs-scroller')
        if (scroller && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.scrollLeft += e.deltaY
      }}
    >
      <Tabs
        value={p.activeId}
        onChange={(e, id: string) => !p.disabled && p.onSelect(id, pickMods(e as React.MouseEvent))}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={t('track.list')}
        sx={{ minHeight: 34, '& .MuiTabs-indicator': { height: 2 } }}
      >
        {p.tracks.map((tr, i) => {
          const m = p.mix[tr.id] ?? DEFAULT_MIX
          const audible = isAudible(tr.id, p.mix, p.tracks)
          return (
            <Tab
              key={tr.id}
              value={tr.id}
              disabled={p.disabled}
              {...drag.item(i)}
              // 選んでいるタブを Ctrl / Shift で押しても onChange は来ないので、ここでも受ける
              onClick={(e) => tr.id === p.activeId && (e.ctrlKey || e.metaKey || e.shiftKey) && p.onSelect(tr.id, pickMods(e))}
              onContextMenu={(e) => {
                e.preventDefault()
                p.onContextMenu(tr.id, e.clientX, e.clientY)
              }}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                    {/* 長い名前は省略して出すので、カーソルを合わせたら全部出す */}
                    <Tooltip title={tr.name} enterDelay={400} placement="top-start">
                      <Box component="span" sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: audible ? 1 : 0.45 }}>
                        {tr.name}
                      </Box>
                    </Tooltip>
                    {p.meter && <LevelMeter source={() => p.meter?.(tr.id) ?? null} width={56} height={3} label={t('meter.track', { name: tr.name })} />}
                  </Box>
                  <MixToggle label="M" title={t('track.mute')} on={m.mute} color="warning.main" onClick={() => p.onToggleMute(tr.id)} />
                  <MixToggle label="S" title={t('track.solo')} on={m.solo} color="success.main" onClick={() => p.onToggleSolo(tr.id)} />
                  <MixToggle label="I" title={t('track.invert')} on={!!p.faders[tr.id]?.invert} color="info.main" onClick={() => p.onToggleInvert(tr.id)} />
                </Box>
              }
              sx={{
                minHeight: 34,
                py: 0.5,
                px: 1.5,
                fontSize: 12,
                textTransform: 'none',
                bgcolor: p.picked.has(tr.id) && tr.id !== p.activeId ? 'action.selected' : undefined,
                opacity: drag.dragId === tr.id ? 0.5 : 1,
                // 差し込む位置の線（このタブの左か、最後のタブの右）
                boxShadow:
                  drag.dropAt === i ? `inset 2px 0 0 ${pal.primary.main}` : drag.dropAt === i + 1 && i === p.tracks.length - 1 ? `inset -2px 0 0 ${pal.primary.main}` : 'none',
              }}
            />
          )
        })}
      </Tabs>
    </Box>
  )
}
