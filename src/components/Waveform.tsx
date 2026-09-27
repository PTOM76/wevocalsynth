import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, Slider, Stack, Tooltip, Typography, alpha, useTheme } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExpand, faMagnifyingGlassMinus, faMagnifyingGlassPlus } from '@fortawesome/free-solid-svg-icons'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'

const WAVE_HEIGHT = 200
const RULER_HEIGHT = 24
const DRAG_THRESHOLD_PX = 3
/** Narrowest visible span in seconds. */
const MIN_VIEW_SEC = 0.02
const ZOOM_STEP = 1.5

interface Props {
  clip: Clip
  position: number
  playing: boolean
  selection: Range | null
  onSeek: (t: number) => void
  onSelect: (r: Range | null) => void
}

/** Min/max per pixel column across all channels for the visible span. */
function computePeaks(clip: Clip, width: number, viewStart: number, viewDur: number) {
  const len = clip.channels[0].length
  const sr = clip.sampleRate
  const min = new Float32Array(width)
  const max = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    const a = Math.floor((viewStart + (x / width) * viewDur) * sr)
    const b = Math.max(a + 1, Math.floor((viewStart + ((x + 1) / width) * viewDur) * sr))
    let lo = 0
    let hi = 0
    for (const ch of clip.channels) {
      for (let i = Math.max(0, a); i < b && i < len; i++) {
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[x] = lo
    max[x] = hi
  }
  return { min, max }
}

/** Pick a "nice" ruler step so labels are at least ~80px apart. */
function rulerStep(duration: number, width: number) {
  const target = (duration * 80) / Math.max(width, 1)
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  return steps.find((s) => s >= target) ?? 600
}

export function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export default function Waveform({ clip, position, playing, selection, onSeek, onSelect }: Props) {
  const theme = useTheme()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x0: number; t0: number; dragging: boolean } | null>(null)
  const [width, setWidth] = useState(0)
  const duration = clipDuration(clip)
  const [view, setView] = useState({ start: 0, dur: duration })

  // Clamp a view into the clip.
  const fit = (start: number, dur: number) => {
    const d = Math.min(duration, Math.max(Math.min(MIN_VIEW_SEC, duration), dur))
    return { start: Math.max(0, Math.min(duration - d, start)), dur: d }
  }

  // New/changed clip: keep the zoom if possible, otherwise show everything.
  useEffect(() => {
    setView((v) => (v.dur > duration || v.dur <= 0 ? { start: 0, dur: duration } : fit(v.start, v.dur)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration])

  // Keep the playhead in view while playing.
  useEffect(() => {
    if (!playing) return
    setView((v) => (position < v.start || position > v.start + v.dur ? fit(position, v.dur) : v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, playing])

  const zoomAround = (factor: number, center: number) =>
    setView((v) => {
      const dur = v.dur / factor
      return fit(center - ((center - v.start) / v.dur) * dur, dur)
    })

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Wheel: Ctrl/⌘ = zoom at cursor, otherwise horizontal scroll. Needs a
  // non-passive listener so the page does not scroll/zoom too.
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        const t = v.start + ((e.clientX - rect.left) / rect.width) * v.dur
        zoomAround(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, t)
      } else {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        setView(fit(v.start + (delta / rect.width) * v.dur, v.dur))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration])

  const peaks = useMemo(
    () => (width > 0 ? computePeaks(clip, width, view.start, view.dur) : null),
    [clip, width, view],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const dpr = window.devicePixelRatio || 1
    const h = WAVE_HEIGHT + RULER_HEIGHT
    canvas.width = width * dpr
    canvas.height = h * dpr
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, h)
    const toX = (t: number) => ((t - view.start) / view.dur) * width

    // Ruler
    g.fillStyle = theme.palette.text.secondary
    g.strokeStyle = theme.palette.divider
    g.font = `11px ${theme.typography.fontFamily}`
    g.textBaseline = 'middle'
    const step = rulerStep(view.dur, width)
    const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0
    for (let t = Math.ceil(view.start / step) * step; t <= view.start + view.dur; t += step) {
      const x = Math.round(toX(t)) + 0.5
      g.beginPath()
      g.moveTo(x, RULER_HEIGHT - 6)
      g.lineTo(x, RULER_HEIGHT)
      g.stroke()
      const m = Math.floor(t / 60)
      const label = m > 0 ? `${m}:${(t - m * 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0')}` : t.toFixed(digits)
      g.fillText(label, x + 3, RULER_HEIGHT / 2 - 2)
    }
    g.beginPath()
    g.moveTo(0, RULER_HEIGHT - 0.5)
    g.lineTo(width, RULER_HEIGHT - 0.5)
    g.stroke()

    // Selection
    if (selection) {
      const x0 = toX(selection.start)
      const x1 = toX(selection.end)
      g.fillStyle = alpha(theme.palette.primary.main, 0.16)
      g.fillRect(x0, RULER_HEIGHT, x1 - x0, WAVE_HEIGHT)
      g.fillStyle = theme.palette.primary.main
      g.fillRect(x0 - 1, RULER_HEIGHT, 2, WAVE_HEIGHT)
      g.fillRect(x1 - 1, RULER_HEIGHT, 2, WAVE_HEIGHT)
    }

    // Waveform
    const mid = RULER_HEIGHT + WAVE_HEIGHT / 2
    const amp = WAVE_HEIGHT / 2 - 4
    g.fillStyle = theme.palette.primary.dark
    for (let x = 0; x < width; x++) {
      const y0 = mid - peaks.max[x] * amp
      const y1 = mid - peaks.min[x] * amp
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }
    g.fillStyle = theme.palette.divider
    g.fillRect(0, mid, width, 1)

    // Playhead
    g.fillStyle = theme.palette.secondary.main
    g.fillRect(Math.round(toX(position)) - 1, 0, 2, h)
  }, [peaks, width, view, position, selection, theme])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = view.start + ((clientX - rect.left) / rect.width) * view.dur
    return Math.max(0, Math.min(duration, t))
  }

  const zoomed = view.dur < duration - 1e-9
  const center = view.start + view.dur / 2

  return (
    <Box ref={boxRef} sx={{ width: '100%', userSelect: 'none', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="音声波形（ドラッグで範囲選択、クリックで再生位置を移動）"
        style={{ width: '100%', height: WAVE_HEIGHT + RULER_HEIGHT, display: 'block', cursor: 'text' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { x0: e.clientX, t0: timeAt(e.clientX), dragging: false }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          if (!d.dragging && Math.abs(e.clientX - d.x0) < DRAG_THRESHOLD_PX) return
          d.dragging = true
          const t = timeAt(e.clientX)
          onSelect({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) })
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          dragRef.current = null
          if (d && !d.dragging) onSeek(timeAt(e.clientX))
        }}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
        <Tooltip title="縮小 (Ctrl+ホイール)">
          <span>
            <IconButton aria-label="縮小" size="small" disabled={!zoomed} onClick={() => zoomAround(1 / ZOOM_STEP, center)}>
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="拡大 (Ctrl+ホイール)">
          <span>
            <IconButton aria-label="拡大"
              size="small"
              disabled={view.dur <= MIN_VIEW_SEC}
              onClick={() => zoomAround(ZOOM_STEP, selection ? (selection.start + selection.end) / 2 : center)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="全体表示">
          <span>
            <IconButton aria-label="全体表示" size="small" disabled={!zoomed} onClick={() => setView({ start: 0, dur: duration })}>
              <FontAwesomeIcon icon={faExpand} />
            </IconButton>
          </span>
        </Tooltip>
        {/* Horizontal scroll bar for the visible span. */}
        <Slider
          size="small"
          aria-label="表示位置"
          disabled={!zoomed}
          value={view.start}
          min={0}
          max={Math.max(0, duration - view.dur)}
          step={view.dur / 100}
          onChange={(_, v) => setView(fit(v as number, view.dur))}
          sx={{ mx: 1 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          表示 {view.dur.toFixed(view.dur < 1 ? 3 : 1)}s
        </Typography>
      </Stack>
    </Box>
  )
}
