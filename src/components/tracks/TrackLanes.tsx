import { useEffect, useRef } from 'react'
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material'
import { DEFAULT_MIX, isAudible, type Track, type TrackFader, type TrackMix } from '../../audio/tracks'
import { computePeaks } from 'wevocal-lib'
import { prepareCanvas, type View } from '../waveform/draw'
import { canvasPixelRatio, LevelMeter, usePalette } from 'pevenmui'
import { useT } from '../../i18n/i18n'
import { pickMods, useTrackDrag, type PickMods } from './useTrackDrag'

/** 1トラックの行の高さ（px） */
const LANE_H = 30
/** 左の名前の欄の幅（px）。名前とメーターの列に、M・S・I の3つのボタンが重ならずに並ぶ幅 */
const HEADER_W = 180

interface Props {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  /** 下の大きな波形と同じ表示範囲 */
  view: View
  disabled: boolean
  /** 押したトラック。修飾キーがあれば複数選択（`picked`）を変える */
  onSelect: (id: string, mods: PickMods) => void
  /** 複数選んでいるトラック（右クリックメニューの対象） */
  picked: ReadonlySet<string>
  /** ドラッグでの並び替え */
  onMove: (id: string, to: number) => void
  onToggleMute: (id: string) => void
  onToggleSolo: (id: string) => void
  /** 「⋯」でトラックのメニューを開けるようにする（スマホ） */
  menuButton?: boolean
  /** 位相の反転（フェーダーの invert）と、その切り替え */
  faders: Record<string, TrackFader>
  onToggleInvert: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  /** トラック `id` のレベルメーター（再生していなければ null） */
  meter: ((id: string) => AnalyserNode | null) | null
}

/** M / S / I の小さな切り替え（オンなら色を付ける） */
/** トラックの操作のメニューを開く「⋯」（スマホ。右クリックができないため）。行やタブを押したときの「選ぶ」とは分ける */
export function TrackMenuButton(p: { title: string; onOpen: (x: number, y: number) => void }) {
  return (
    <Tooltip title={p.title}>
      <ButtonBase
        component="span"
        role="button"
        aria-label={p.title}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          p.onOpen(r.left, r.bottom)
        }}
        sx={{ width: 24, height: 24, borderRadius: 0.5, color: 'text.secondary', fontSize: 14, lineHeight: 1 }}
      >
        ⋯
      </ButtonBase>
    </Tooltip>
  )
}

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
      const dpr = canvasPixelRatio()
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      const g = prepareCanvas(canvas, w, h)
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
  const drag = useTrackDrag(p.tracks, 'y', p.disabled, p.onMove)
  if (p.tracks.length < 2) return null
  return (
    <Box role="listbox" aria-multiselectable aria-label={t('track.list')} sx={{ maxHeight: LANE_H * 4.5, overflowY: 'auto' }}>
      {p.tracks.map((tr, i) => {
        const m = p.mix[tr.id] ?? DEFAULT_MIX
        const selected = tr.id === p.activeId
        const audible = isAudible(tr.id, p.mix, p.tracks)
        const picked = p.picked.has(tr.id)
        // 差し込む位置の線（この行の上か、最後の行の下）
        const line = drag.dropAt === i ? 'top' : drag.dropAt === i + 1 && i === p.tracks.length - 1 ? 'bottom' : null
        return (
          <Box
            key={tr.id}
            role="option"
            aria-selected={selected || picked}
            {...drag.item(i)}
            onClick={(e) => !p.disabled && p.onSelect(tr.id, pickMods(e))}
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
              bgcolor: selected || picked ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: selected || picked ? 'action.selected' : 'action.hover' },
              opacity: drag.dragId === tr.id ? 0.5 : 1,
              boxShadow: line ? `inset 0 ${line === 'top' ? 2 : -2}px 0 ${pal.primary.main}` : 'none',
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
                {/* メーターは名前の列に収める（固定幅だと M・S・I のボタンにはみ出した） */}
                {p.meter && <LevelMeter source={() => p.meter?.(tr.id) ?? null} width={80} height={4} label={t('meter.track', { name: tr.name })} />}
              </Box>
              <MixToggle label="M" title={t('track.mute')} on={m.mute} color="warning.main" onClick={() => p.onToggleMute(tr.id)} />
              <MixToggle label="S" title={t('track.solo')} on={m.solo} color="success.main" onClick={() => p.onToggleSolo(tr.id)} />
              <MixToggle label="I" title={t('track.invert')} on={!!p.faders[tr.id]?.invert} color="info.main" onClick={() => p.onToggleInvert(tr.id)} />
              {p.menuButton && <TrackMenuButton title={t('track.menu')} onOpen={(x, y) => p.onContextMenu(tr.id, x, y)} />}
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
