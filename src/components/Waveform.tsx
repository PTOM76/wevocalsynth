import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, useMediaQuery, useTheme, type Theme } from '@mui/material'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../dsp/engine'
import {
  PITCH_HEIGHT,
  RULER_HEIGHT,
  WAVE_HEIGHT,
  computePeaks,
  drawPitchLane,
  drawPlayhead,
  drawRuler,
  drawSelection,
  drawSpectrogram,
  drawWave,
  pitchRange,
  type DrawContext,
} from './waveform/draw'
import { MIN_VIEW_SEC, ZOOM_STEP, useWaveformView } from './waveform/useWaveformView'
import WaveformToolbar from './waveform/WaveformToolbar'

export { hzToMidi } from './waveform/draw'

const DRAG_THRESHOLD_PX = 3
/** 範囲の端をつかめる距離（px） */
const EDGE_GRAB_PX = 6
/** 端のドラッグで縮められる最小の範囲（秒） */
const MIN_RANGE_SEC = 0.01

/** 範囲の端のドラッグ。stretch なら離したときにその長さまで伸縮する */
interface EdgeDrag {
  index: number
  side: 'start' | 'end'
  stretch: boolean
  orig: Range
  last: Range
}

/** ピッチ帯に描く点。`midi` が null なら消しゴム */
export interface DrawPoint {
  k: number
  midi: number | null
}

interface Props {
  clip: Clip
  position: number
  playing: boolean
  /** 選択範囲（複数可、開始位置順） */
  selections: Range[]
  onSeek: (t: number) => void
  /** ドラッグで範囲を選ぶ。Ctrl/⌘ を押しながらなら既存の範囲に追加する */
  onSelectionsChange: (rs: Range[]) => void
  /** Shift+右端ドラッグで、範囲 `range` を長さ `duration`（秒）に伸縮する */
  onStretchRange: (range: Range, duration: number) => void
  /** F0（Hz、`F0_HOP_SEC` 間隔、無声は 0）。解析中は null */
  pitch: Float32Array | null
  showPitch: boolean
  onShowPitchChange: (show: boolean) => void
  /** 描いた目標ピッチ（`pitch` と同じ長さ、0 は未編集） */
  target: Float32Array | null
  penMode: boolean
  onPenModeChange: (pen: boolean) => void
  /** フレーム `from.k` から `to.k` までを描く（`midi` が null なら消す） */
  onDraw: (from: DrawPoint, to: DrawPoint) => void
  onApplyCurve: () => void
  onClearCurve: () => void
  busy: boolean
  /** スペクトログラム。解析中は null */
  spectrogram: Spectrogram | null
  showSpectrogram: boolean
  onShowSpectrogramChange: (show: boolean) => void
}

/** Canvas は CSS 変数を使えないため、現在の配色（ライト/ダーク）のパレット値を直接取り出す */
function usePalette() {
  const theme = useTheme()
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const schemes = (theme as Theme & { colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>> })
    .colorSchemes
  return { pal: schemes?.[dark ? 'dark' : 'light']?.palette ?? theme.palette, dark, font: theme.typography.fontFamily }
}

export default function Waveform(props: Props) {
  const { clip, position, playing, selections, pitch, showPitch, target, penMode, spectrogram, showSpectrogram } = props
  const { pal, dark, font } = usePalette()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // base: ドラッグ開始時に残す範囲（追加選択なら既存の範囲、通常は空）
  const dragRef = useRef<{ x0: number; t0: number; dragging: boolean; base: Range[]; edge?: EdgeDrag } | null>(null)
  const [edgeHover, setEdgeHover] = useState(false)
  const drawRef = useRef<DrawPoint | null>(null)
  const [width, setWidth] = useState(0)
  // `target` は描画中に中身だけが書き換わるため、再描画のきっかけに使うカウンタ
  const [drawVersion, setDrawVersion] = useState(0)
  const duration = clipDuration(clip)
  const { view, zoomAround, scrollTo, showAll, zoomed } = useWaveformView(duration, position, playing, canvasRef)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const peaks = useMemo(() => (width > 0 ? computePeaks(clip, width, view) : null), [clip, width, view])
  const range = useMemo(() => (pitch ? pitchRange(pitch) : null), [pitch])
  const height = RULER_HEIGHT + WAVE_HEIGHT + (showPitch ? PITCH_HEIGHT : 0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, height)
    g.font = `11px ${font}`
    g.textBaseline = 'middle'
    const c: DrawContext = { g, width, view, pal, dark }

    drawRuler(c)
    // スペクトログラムは波形の代わりに表示し、選択範囲はその上に重ねる
    if (showSpectrogram) drawSpectrogram(c, spectrogram)
    for (const r of selections) drawSelection(c, r, height)
    if (!showSpectrogram) drawWave(c, peaks)
    if (showPitch) drawPitchLane(c, pitch, range, target)
    drawPlayhead(c, position, height)
  }, [peaks, width, height, view, pal, dark, font, selections, showSpectrogram, spectrogram, showPitch, pitch, range, target, drawVersion, position])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = view.start + ((clientX - rect.left) / rect.width) * view.dur
    return Math.max(0, Math.min(duration, t))
  }

  /** `clientX` の近くにある範囲の端（なければ null） */
  const edgeAt = (clientX: number): { index: number; side: 'start' | 'end' } | null => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const xOf = (t: number) => rect.left + ((t - view.start) / view.dur) * rect.width
    let best: { index: number; side: 'start' | 'end'; d: number } | null = null
    selections.forEach((r, index) => {
      for (const side of ['start', 'end'] as const) {
        const d = Math.abs(xOf(r[side]) - clientX)
        if (d <= EDGE_GRAB_PX && (!best || d < best.d)) best = { index, side, d }
      }
    })
    return best
  }

  /** 端のドラッグ中の範囲を更新する */
  const dragEdge = (edge: EdgeDrag, clientX: number) => {
    const t = timeAt(clientX)
    const { orig } = edge
    edge.last =
      edge.side === 'start'
        ? { start: Math.min(t, orig.end - MIN_RANGE_SEC), end: orig.end }
        : { start: orig.start, end: Math.max(t, orig.start + MIN_RANGE_SEC) }
    props.onSelectionsChange(selections.map((r, i) => (i === edge.index ? edge.last : r)))
  }

  /** ピッチ帯上の点（Shift で半音に吸着、Alt で消しゴム）。描画中でなく帯の外なら null */
  const drawPointAt = (e: React.PointerEvent): DrawPoint | null => {
    if (!penMode || !showPitch || !range) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top - RULER_HEIGHT - WAVE_HEIGHT
    if (drawRef.current === null && (y < 0 || y > PITCH_HEIGHT)) return null
    const k = Math.round(timeAt(e.clientX) / F0_HOP_SEC)
    if (e.altKey) return { k, midi: null }
    const m = range.hi - (Math.min(Math.max(y, 0), PITCH_HEIGHT) / PITCH_HEIGHT) * (range.hi - range.lo)
    return { k, midi: e.shiftKey ? Math.round(m) : m }
  }

  const drawTo = (p: DrawPoint) => {
    props.onDraw(drawRef.current ?? p, p)
    drawRef.current = p
    setDrawVersion((v) => v + 1)
  }

  const center = view.start + view.dur / 2
  const active = selections[selections.length - 1]

  return (
    <Box ref={boxRef} sx={{ width: '100%', userSelect: 'none', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="音声波形（ドラッグで範囲選択、Ctrl+ドラッグで範囲を追加、範囲の端をドラッグで調整、Shift+右端ドラッグで伸縮、クリックで再生位置を移動）"
        style={{
          width: '100%',
          height,
          display: 'block',
          cursor: penMode && showPitch ? 'crosshair' : edgeHover ? 'ew-resize' : 'text',
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = drawPointAt(e)
          if (p) return drawTo(p)
          const t0 = timeAt(e.clientX)
          const hit = edgeAt(e.clientX)
          if (hit) {
            const orig = selections[hit.index]
            const stretch = e.shiftKey && hit.side === 'end'
            dragRef.current = { x0: e.clientX, t0, dragging: true, base: selections, edge: { ...hit, stretch, orig, last: orig } }
            return
          }
          const add = e.ctrlKey || e.metaKey
          dragRef.current = { x0: e.clientX, t0, dragging: false, base: add ? selections : [] }
        }}
        onPointerMove={(e) => {
          if (drawRef.current) {
            const p = drawPointAt(e)
            if (p) drawTo(p)
            return
          }
          const d = dragRef.current
          if (!d) {
            setEdgeHover(!penMode && !!edgeAt(e.clientX))
            return
          }
          if (d.edge) return dragEdge(d.edge, e.clientX)
          if (!d.dragging && Math.abs(e.clientX - d.x0) < DRAG_THRESHOLD_PX) return
          d.dragging = true
          const t = timeAt(e.clientX)
          props.onSelectionsChange([...d.base, { start: Math.min(d.t0, t), end: Math.max(d.t0, t) }])
        }}
        onPointerUp={(e) => {
          if (drawRef.current) {
            drawRef.current = null
            return
          }
          const d = dragRef.current
          dragRef.current = null
          const edge = d?.edge
          if (edge?.stretch && edge.last.end !== edge.orig.end) {
            props.onStretchRange(edge.orig, edge.last.end - edge.last.start)
          } else if (d && !d.dragging) {
            props.onSeek(timeAt(e.clientX))
          }
        }}
      />
      <WaveformToolbar
        view={view}
        duration={duration}
        zoomed={zoomed}
        canZoomIn={view.dur > MIN_VIEW_SEC}
        onZoomOut={() => zoomAround(1 / ZOOM_STEP, center)}
        onZoomIn={() => zoomAround(ZOOM_STEP, active ? (active.start + active.end) / 2 : center)}
        onShowAll={showAll}
        onScroll={scrollTo}
        showSpectrogram={showSpectrogram}
        onShowSpectrogramChange={props.onShowSpectrogramChange}
        showPitch={showPitch}
        onShowPitchChange={props.onShowPitchChange}
        penMode={penMode}
        onPenModeChange={props.onPenModeChange}
        hasCurve={!!target && target.some((v) => v > 0)}
        busy={props.busy}
        onApplyCurve={props.onApplyCurve}
        onClearCurve={props.onClearCurve}
      />
    </Box>
  )
}
