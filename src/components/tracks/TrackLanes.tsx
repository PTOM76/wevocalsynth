import { useEffect, useRef } from 'react'
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material'
import { DEFAULT_MIX, isAudible, type Track, type TrackMix } from '../../audio/tracks'
import { computePeaks } from '../waveform/peaks'
import type { View } from '../waveform/draw'
import { usePalette } from '../waveform/usePalette'
import { useT } from '../../i18n/i18n'
import LevelMeter from '../LevelMeter'

/** 1トラックの行の高さ（px） */
const LANE_H = 30
/** 左の名前の欄の幅（px） */
const HEADER_W = 160

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  /** 下の大きな波形と同じ表示範囲 */
  view: View
  disabled: boolean
  onSelect: (id: string) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  /** トラック `id` のレベルメーター（再生していなければ null） */
  meter: ((id: string) => AnalyserNode | null) | null
}

/** M / S の小さな切り替え（オンなら色を付ける） */
export function MixToggle(p: { label: string; title: string; on: boolean; color: string; onClick: () => void }) {
  return (
    <Tooltip title={p.title}>
      {/* タブの中にも置くので、button の入れ子にならないよう span で描く */}
      <ButtonBase
        component="span"
        role="button"
        aria-label={p.title}
        aria-pressed={p.on}
        onClick={(e) => {
          // 行を押したときの「選ぶ」と分ける
          e.stopPropagation()
          p.onClick()
        }}
        sx={{
          width: 18,
          height: 18,
          flexShrink: 0,
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 0.5,
          bgcolor: p.on ? p.color : 'action.hover',
          color: p.on ? 'common.white' : 'text.secondary',
        }}
      >
        {p.label}
      </ButtonBase>
    </Tooltip>
  )
}

/** トラックの小さな波形（下の大きな波形と同じ表示範囲で描く） */
function MiniWave({ track, view, selected }: { track: Track; view: View; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { pal } = usePalette()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      canvas.width = w
      canvas.height = h
      const g = canvas.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, w, h)
      const { min, max } = computePeaks(track.clip, w, view)
      g.fillStyle = selected ? pal.primary.main : pal.text.secondary
      const mid = h / 2
      for (let x = 0; x < w; x++) {
        const top = mid - max[x] * mid
        const bottom = mid - min[x] * mid
        g.fillRect(x, top, 1, Math.max(1, bottom - top))
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [track.clip, view, selected, pal])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

/**
 * 波形付きのトラック一覧（2本以上のときだけ出す）。行を押すとそのトラックを編集し、右クリックで操作のメニュー。
 * 小さな波形は下の大きな波形と同じ範囲を描くので、トラック同士のタイミングを見比べられる
 */
export default function TrackLanes(p: Props) {
  const t = useT()
  const { pal } = usePalette()
  if (p.tracks.length < 2) return null
  return (
    <Box role="listbox" aria-label={t('track.list')} sx={{ maxHeight: LANE_H * 4.5, overflowY: 'auto' }}>
      {p.tracks.map((tr, i) => {
        const m = p.mix[tr.id] ?? DEFAULT_MIX
        const selected = tr.id === p.activeId
        const audible = isAudible(tr.id, p.mix, p.tracks)
        return (
          <Box
            key={tr.id}
            role="option"
            aria-selected={selected}
            onClick={() => !p.disabled && p.onSelect(tr.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              p.onContextMenu(tr.id, e.clientX, e.clientY)
            }}
            sx={{
              display: 'flex',
              height: LANE_H,
              cursor: p.disabled ? 'default' : 'pointer',
              borderTop: i ? 1 : 0,
              borderColor: 'divider',
              bgcolor: selected ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
            }}
          >
            <Box
              sx={{
                width: HEADER_W,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                borderRight: 1,
                borderColor: 'divider',
                // 選んでいるトラックは左端に色の帯を付ける
                boxShadow: selected ? `inset 3px 0 0 ${pal.primary.main}` : 'none',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* 長い名前は省略して出すので、カーソルを合わせたら全部出す */}
                <Tooltip title={tr.name} enterDelay={400} placement="top-start">
                  <Typography sx={{ fontSize: 12, lineHeight: 1.3, fontWeight: selected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tr.name}
                  </Typography>
                </Tooltip>
                {p.meter && <LevelMeter source={() => p.meter?.(tr.id) ?? null} width={84} height={3} label={t('meter.track', { name: tr.name })} />}
              </Box>
              <MixToggle label="M" title={t('track.mute')} on={m.mute} color="warning.main" onClick={() => p.onToggleMute(tr.id)} />
              <MixToggle label="S" title={t('track.solo')} on={m.solo} color="success.main" onClick={() => p.onToggleSolo(tr.id)} />
            </Box>
            {/* 鳴らないトラックは薄く出す */}
            <Box sx={{ flex: 1, minWidth: 0, opacity: audible ? 1 : 0.35, py: 0.25 }}>
              <MiniWave track={tr} view={p.view} selected={selected} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
