import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { usePalette } from './waveform/usePalette'
import { useLaneDivider } from './waveform/useLaneDivider'
import { useRangeEdges, type EdgeDrag } from './waveform/useRangeEdges'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../dsp/engine'
import {
  RULER_HEIGHT,
  computePeaks,
  laneHeights,
  drawPitchLane,
  drawPlayhead,
  drawRuler,
  drawSelection,
  drawSpectrogram,
  drawWave,
  pitchRange,
  type DrawContext,
} from './waveform/draw'
import type { useWaveformView } from './waveform/useWaveformView'
import { useLang, useT } from '../i18n/i18n'

export { hzToMidi } from './waveform/draw'

const DRAG_THRESHOLD_PX = 3
/** 長押しでメニューを出すまでの時間（ミリ秒）と、その間に動いてよい距離（px） */
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 8

/** ピッチ帯に描く点。`midi` が null なら消しゴム */
export interface DrawPoint {
  k: number
  midi: number | null
}

interface Props {
  clip: Clip
  position: number
  /** 選択範囲（複数可、開始位置順） */
  selections: Range[]
  onSeek: (t: number) => void
  /** ドラッグで範囲を選ぶ。Ctrl/⌘ を押しながらなら既存の範囲に追加する */
  onSelectionsChange: (rs: Range[]) => void
  /** Shift+右端ドラッグで、範囲 `range` を長さ `duration`（秒）に伸縮する */
  onStretchRange: (range: Range, duration: number) => void
  /** 右クリック、またはタッチの長押し（画面上の位置） */
  onContextMenu: (x: number, y: number) => void
  /** 表示範囲（拡大縮小・スクロール）。ツールバーと共有するため画面側で持つ */
  viewCtl: ReturnType<typeof useWaveformView>
  /** F0（Hz、`F0_HOP_SEC` 間隔、無声は 0）。解析中は null */
  pitch: Float32Array | null
  showPitch: boolean
  /** 描いた目標ピッチ（`pitch` と同じ長さ、0 は未編集） */
  target: Float32Array | null
  penMode: boolean
  /** フレーム `from.k` から `to.k` までを描く（`midi` が null なら消す） */
  onDraw: (from: DrawPoint, to: DrawPoint) => void
  /** スペクトログラム。解析中は null */
  spectrogram: Spectrogram | null
  showSpectrogram: boolean
  /** ピッチ帯の割合（%）。境目のドラッグで変わる */
  pitchPercent: number
  onPitchPercentChange: (percent: number) => void
}

export default function Waveform(props: Props) {
  const { clip, position, selections, pitch, showPitch, target, penMode, spectrogram, showSpectrogram } = props
  const { pal, dark, font } = usePalette()
  const t = useT()
  // 言語が変わったら Canvas の文字（「解析中…」）も描き直す
  const lang = useLang()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // base: ドラッグ開始時に残す範囲（追加選択なら既存の範囲、通常は空）
  const dragRef = useRef<{ x0: number; t0: number; dragging: boolean; base: Range[]; edge?: EdgeDrag } | null>(null)
  const [edgeHover, setEdgeHover] = useState(false)
  const drawRef = useRef<DrawPoint | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const width = size.width
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  // `target` は描画中に中身だけが書き換わるため、再描画のきっかけに使うカウンタ
  const [drawVersion, setDrawVersion] = useState(0)
  const duration = clipDuration(clip)
  const { view, scrollTo, zoomed, wheel } = props.viewCtl

  // 置き場所の大きさに合わせて Canvas を伸び縮みさせる（高さも画面に合わせる）
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ページ自体がスクロール・拡大しないよう、ホイールは non-passive で登録する
  const wheelRef = useRef(wheel)
  wheelRef.current = wheel
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      wheelRef.current(e, canvas.getBoundingClientRect())
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const peaks = useMemo(() => (width > 0 ? computePeaks(clip, width, view) : null), [clip, width, view])
  const range = useMemo(() => (pitch ? pitchRange(pitch) : null), [pitch])
  const { waveH, pitchH, height } = laneHeights(size.height, showPitch, props.pitchPercent)
  const divider = useLaneDivider(canvasRef, { waveH, pitchH }, showPitch, props.onPitchPercentChange)
  const [dividerHover, setDividerHover] = useState(false)

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
    const c: DrawContext = { g, width, view, pal, dark, waveH, pitchH }

    drawRuler(c)
    // スペクトログラムは波形の代わりに表示し、選択範囲はその上に重ねる
    if (showSpectrogram) drawSpectrogram(c, spectrogram)
    for (const r of selections) drawSelection(c, r, height)
    if (!showSpectrogram) drawWave(c, peaks)
    if (showPitch) drawPitchLane(c, pitch, range, target)
    drawPlayhead(c, position, height)
  }, [lang, peaks, width, height, waveH, pitchH, view, pal, dark, font, selections, showSpectrogram, spectrogram, showPitch, pitch, range, target, drawVersion, position])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = view.start + ((clientX - rect.left) / rect.width) * view.dur
    return Math.max(0, Math.min(duration, t))
  }

  const { edgeAt, dragEdge } = useRangeEdges(canvasRef, view, selections, timeAt, props.onSelectionsChange)

  /** ピッチ帯上の点（Shift で半音に吸着、Alt で消しゴム）。描画中でなく帯の外なら null */
  const drawPointAt = (e: React.PointerEvent): DrawPoint | null => {
    if (!penMode || !showPitch || !range) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top - RULER_HEIGHT - waveH
    if (drawRef.current === null && (y < 0 || y > pitchH)) return null
    const k = Math.round(timeAt(e.clientX) / F0_HOP_SEC)
    if (e.altKey) return { k, midi: null }
    const m = range.hi - (Math.min(Math.max(y, 0), pitchH) / pitchH) * (range.hi - range.lo)
    return { k, midi: e.shiftKey ? Math.round(m) : m }
  }

  const drawTo = (p: DrawPoint) => {
    props.onDraw(drawRef.current ?? p, p)
    drawRef.current = p
    setDrawVersion((v) => v + 1)
  }

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }

  return (
    <Stack sx={{ width: '100%', height: '100%', minHeight: 0, userSelect: 'none' }}>
      {/* Canvas はこの箱の大きさいっぱいに描く */}
      <Box ref={boxRef} sx={{ flex: 1, minHeight: 0, touchAction: 'none', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('wave.aria')}
        style={{
          width: '100%',
          height,
          display: 'block',
          cursor: dividerHover ? 'row-resize' : penMode && showPitch ? 'crosshair' : edgeHover ? 'ew-resize' : 'text',
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          props.onContextMenu(e.clientX, e.clientY)
        }}
        onPointerDown={(e) => {
          // 右クリックは範囲選択を始めない（コンテキストメニューに任せる）
          if (e.button === 2) return
          e.currentTarget.setPointerCapture(e.pointerId)
          if (divider.start(e)) return
          // タッチの長押しは右クリックの代わり（離すか動かすと取り消す）
          if (e.pointerType === 'touch') {
            const { clientX: x, clientY: y } = e
            const timer = window.setTimeout(() => {
              longPressRef.current = null
              dragRef.current = null
              props.onContextMenu(x, y)
            }, LONG_PRESS_MS)
            longPressRef.current = { timer, x, y }
          }
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
          const lp = longPressRef.current
          if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_SLOP_PX) cancelLongPress()
          if (divider.dragging()) return divider.move(e)
          if (drawRef.current) {
            const p = drawPointAt(e)
            if (p) drawTo(p)
            return
          }
          const d = dragRef.current
          if (!d) {
            setDividerHover(divider.hit(e))
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
          cancelLongPress()
          if (divider.dragging()) return divider.end()
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
      </Box>
      {/* 表示範囲の横スクロールバー */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1 }}>
        <Slider
          size="small"
          aria-label={t('wave.scroll')}
          disabled={!zoomed}
          value={view.start}
          min={0}
          max={Math.max(0, duration - view.dur)}
          step={view.dur / 100}
          onChange={(_, v) => scrollTo(v as number)}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {view.dur.toFixed(view.dur < 1 ? 3 : 1)}s
        </Typography>
      </Stack>
    </Stack>
  )
}
