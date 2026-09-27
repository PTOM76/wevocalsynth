import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, IconButton, Slider, Stack, Tooltip, Typography, alpha, useMediaQuery, useTheme } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExpand, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faMusic, faPen, faChartColumn, faCheck, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import type { Theme } from '@mui/material'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { F0_HOP_SEC, type Spectrogram } from '../dsp/engine'

const WAVE_HEIGHT = 200
const RULER_HEIGHT = 24
const PITCH_HEIGHT = 140
/** スペクトログラムの配色（magma 風）。明るさ 0〜255 → RGB */
const SPEC_LUT = (() => {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.25, 59, 15, 112],
    [0.5, 140, 41, 129],
    [0.75, 222, 73, 104],
    [0.9, 254, 159, 109],
    [1, 252, 253, 191],
  ]
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const u = i / 255
    const j = Math.max(1, stops.findIndex((st) => st[0] >= u))
    const [u0, ...c0] = stops[j - 1]
    const [u1, ...c1] = stops[j]
    const g = (u - u0) / (u1 - u0 || 1)
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = Math.round(c0[k] + (c1[k] - c0[k]) * g)
  }
  return lut
})()

/** 表示範囲のスペクトログラムを width × height の画像にする（1列に複数フレームが入る場合は最大値） */
function renderSpectrogram(spec: Spectrogram, width: number, height: number, viewStart: number, viewDur: number) {
  const img = new ImageData(width, height)
  const px = img.data
  for (let x = 0; x < width; x++) {
    const ka = Math.max(0, Math.floor((viewStart + (x / width) * viewDur) / spec.hopSec))
    const kb = Math.min(spec.frames - 1, Math.max(ka, Math.floor((viewStart + ((x + 1) / width) * viewDur) / spec.hopSec)))
    for (let y = 0; y < height; y++) {
      const r = Math.round(((height - 1 - y) / (height - 1)) * (spec.rows - 1))
      let v = 0
      for (let k = ka; k <= kb; k++) v = Math.max(v, spec.data[k * spec.rows + r])
      const o = (y * width + x) * 4
      px[o] = SPEC_LUT[v * 3]
      px[o + 1] = SPEC_LUT[v * 3 + 1]
      px[o + 2] = SPEC_LUT[v * 3 + 2]
      px[o + 3] = 255
    }
  }
  return img
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const DRAG_THRESHOLD_PX = 3
/** 表示できる最小の時間幅（秒） */
const MIN_VIEW_SEC = 0.02
const ZOOM_STEP = 1.5

interface Props {
  clip: Clip
  position: number
  playing: boolean
  selection: Range | null
  onSeek: (t: number) => void
  onSelect: (r: Range | null) => void
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

export interface DrawPoint {
  k: number
  midi: number | null
}

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440)

/** ピッチ帯の縦軸（MIDIノート番号）。有声部分の範囲に余白を足し、最低1オクターブにする */
function pitchRange(pitch: Float32Array) {
  let lo = Infinity
  let hi = -Infinity
  for (const hz of pitch) {
    if (hz <= 0) continue
    const m = hzToMidi(hz)
    if (m < lo) lo = m
    if (m > hi) hi = m
  }
  if (!Number.isFinite(lo)) return { lo: 48, hi: 72 }
  lo = Math.floor(lo) - 2
  hi = Math.ceil(hi) + 2
  if (hi - lo < 12) {
    const c = (lo + hi) / 2
    lo = Math.floor(c - 6)
    hi = lo + 12
  }
  return { lo, hi }
}

/** 表示範囲について、全チャンネルを通した1ピクセル列ごとの最小値・最大値を求める */
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

/** ラベル間隔が約80px以上になるよう、きりのよい目盛り間隔を選ぶ */
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

export default function Waveform({
  clip,
  position,
  playing,
  selection,
  onSeek,
  onSelect,
  pitch,
  showPitch,
  onShowPitchChange,
  target,
  penMode,
  onPenModeChange,
  onDraw,
  onApplyCurve,
  onClearCurve,
  busy,
  spectrogram,
  showSpectrogram,
  onShowSpectrogramChange,
}: Props) {
  const theme = useTheme()
  // Canvas は CSS 変数を使えないため、現在の配色（ライト/ダーク）のパレット値を直接使う
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const schemes = (theme as Theme & { colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>> })
    .colorSchemes
  const pal = schemes?.[dark ? 'dark' : 'light']?.palette ?? theme.palette
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x0: number; t0: number; dragging: boolean } | null>(null)
  const drawRef = useRef<DrawPoint | null>(null)
  const [width, setWidth] = useState(0)
  const duration = clipDuration(clip)
  const [view, setView] = useState({ start: 0, dur: duration })

  // 表示範囲をクリップ内に収める
  const fit = (start: number, dur: number) => {
    const d = Math.min(duration, Math.max(Math.min(MIN_VIEW_SEC, duration), dur))
    return { start: Math.max(0, Math.min(duration - d, start)), dur: d }
  }

  // クリップが変わったら、可能なら拡大率を保ち、無理なら全体表示にする
  useEffect(() => {
    setView((v) => (v.dur > duration || v.dur <= 0 ? { start: 0, dur: duration } : fit(v.start, v.dur)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration])

  // 再生中は再生位置が画面内に収まるようにする
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

  // ホイール: Ctrl/⌘ 併用でカーソル位置を中心に拡大縮小、それ以外は横スクロール。
  // ページ自体がスクロール・拡大しないよう non-passive で登録する
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

  const range = useMemo(() => (pitch ? pitchRange(pitch) : null), [pitch])
  // `target` は描画中に中身だけが書き換わるため、再描画のきっかけに使うカウンタ
  const [drawVersion, setDrawVersion] = useState(0)
  const height = RULER_HEIGHT + WAVE_HEIGHT + (showPitch ? PITCH_HEIGHT : 0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const dpr = window.devicePixelRatio || 1
    const h = height
    canvas.width = width * dpr
    canvas.height = h * dpr
    const g = canvas.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, h)
    const toX = (t: number) => ((t - view.start) / view.dur) * width

    // 目盛り
    g.fillStyle = pal.text.secondary
    g.strokeStyle = pal.divider
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

    // スペクトログラム（波形の代わりに表示）。選択範囲はこの上に重ねる
    if (showSpectrogram) {
      if (spectrogram) {
        const img = renderSpectrogram(spectrogram, width, WAVE_HEIGHT, view.start, view.dur)
        const off = new OffscreenCanvas(width, WAVE_HEIGHT)
        off.getContext('2d')!.putImageData(img, 0, 0)
        g.drawImage(off, 0, RULER_HEIGHT)
        // 周波数の目盛り
        g.fillStyle = 'rgba(255, 255, 255, 0.85)'
        const logSpan = Math.log(spectrogram.maxHz / spectrogram.minHz)
        for (const hz of [100, 1000, 10000]) {
          if (hz >= spectrogram.maxHz) continue
          const y = RULER_HEIGHT + WAVE_HEIGHT - (Math.log(hz / spectrogram.minHz) / logSpan) * WAVE_HEIGHT
          g.fillRect(0, Math.round(y), 6, 1)
          g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
        }
      } else {
        g.fillStyle = pal.text.secondary
        g.fillText('解析中…', 8, RULER_HEIGHT + WAVE_HEIGHT / 2)
      }
    }

    // 選択範囲
    if (selection) {
      const x0 = toX(selection.start)
      const x1 = toX(selection.end)
      g.fillStyle = alpha(pal.primary.main, 0.16)
      g.fillRect(x0, RULER_HEIGHT, x1 - x0, h - RULER_HEIGHT)
      g.fillStyle = pal.primary.main
      g.fillRect(x0 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
      g.fillRect(x1 - 1, RULER_HEIGHT, 2, h - RULER_HEIGHT)
    }

    // 波形
    if (!showSpectrogram) {
      const mid = RULER_HEIGHT + WAVE_HEIGHT / 2
      const amp = WAVE_HEIGHT / 2 - 4
      g.fillStyle = dark ? pal.primary.main : pal.primary.dark
      for (let x = 0; x < width; x++) {
        const y0 = mid - peaks.max[x] * amp
        const y1 = mid - peaks.min[x] * amp
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
      }
      g.fillStyle = pal.divider
      g.fillRect(0, mid, width, 1)
    }

    // ピッチ帯: 音名のグリッドと F0 曲線
    if (showPitch) {
      const top = RULER_HEIGHT + WAVE_HEIGHT
      g.fillStyle = pal.divider
      g.fillRect(0, top, width, 1)
      if (!pitch || !range) {
        g.fillStyle = pal.text.secondary
        g.fillText('解析中…', 8, top + PITCH_HEIGHT / 2)
      } else {
        const toY = (m: number) => top + ((range.hi - m) / (range.hi - range.lo)) * PITCH_HEIGHT
        const perSemitone = PITCH_HEIGHT / (range.hi - range.lo)
        for (let m = Math.ceil(range.lo); m <= range.hi; m++) {
          const isC = m % 12 === 0
          if (!isC && perSemitone < 6) continue
          g.fillStyle = isC ? pal.divider : alpha(pal.divider, 0.4)
          g.fillRect(0, Math.round(toY(m)), width, 1)
          if (isC || perSemitone >= 12) {
            g.fillStyle = pal.text.secondary
            g.fillText(`${NOTE_NAMES[m % 12]}${m / 12 - 1 | 0}`, 4, toY(m) - 7)
          }
        }
        const k0 = Math.max(0, Math.floor(view.start / F0_HOP_SEC) - 1)
        const k1 = Math.min(pitch.length - 1, Math.ceil((view.start + view.dur) / F0_HOP_SEC) + 1)
        const curve = (data: Float32Array, color: string) => {
          g.strokeStyle = color
          g.beginPath()
          let drawing = false
          for (let k = k0; k <= k1; k++) {
            const hz = data[k]
            if (!(hz > 0)) {
              drawing = false
              continue
            }
            const x = toX(k * F0_HOP_SEC)
            const y = toY(hzToMidi(hz))
            if (drawing) g.lineTo(x, y)
            else g.moveTo(x, y)
            drawing = true
          }
          g.stroke()
        }
        g.lineWidth = 2
        g.lineJoin = 'round'
        const edited = !!target && target.some((v) => v > 0)
        curve(pitch, edited ? alpha(pal.secondary.main, 0.4) : pal.secondary.main)
        if (edited) curve(target, pal.primary.main)
        g.lineWidth = 1
      }
    }

    // 再生位置
    g.fillStyle = pal.text.primary
    g.fillRect(Math.round(toX(position)) - 1, 0, 2, h)
  }, [peaks, width, view, position, selection, pal, dark, theme, height, showPitch, pitch, range, target, drawVersion, showSpectrogram, spectrogram])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = view.start + ((clientX - rect.left) / rect.width) * view.dur
    return Math.max(0, Math.min(duration, t))
  }

  /** ピッチ帯上の点（Shift で半音に吸着、Alt で消しゴム）。帯の外なら null */
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

  const zoomed = view.dur < duration - 1e-9
  const hasCurve = !!target && target.some((v) => v > 0)
  const center = view.start + view.dur / 2

  return (
    <Box ref={boxRef} sx={{ width: '100%', userSelect: 'none', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="音声波形（ドラッグで範囲選択、クリックで再生位置を移動）"
        style={{ width: '100%', height, display: 'block', cursor: penMode && showPitch ? 'crosshair' : 'text' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = drawPointAt(e)
          if (p) {
            drawRef.current = p
            onDraw(p, p)
            setDrawVersion((v) => v + 1)
            return
          }
          dragRef.current = { x0: e.clientX, t0: timeAt(e.clientX), dragging: false }
        }}
        onPointerMove={(e) => {
          if (drawRef.current) {
            const p = drawPointAt(e)
            if (p) {
              onDraw(drawRef.current, p)
              drawRef.current = p
              setDrawVersion((v) => v + 1)
            }
            return
          }
          const d = dragRef.current
          if (!d) return
          if (!d.dragging && Math.abs(e.clientX - d.x0) < DRAG_THRESHOLD_PX) return
          d.dragging = true
          const t = timeAt(e.clientX)
          onSelect({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) })
        }}
        onPointerUp={(e) => {
          if (drawRef.current) {
            drawRef.current = null
            return
          }
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
        <Tooltip title="スペクトログラム表示">
          <IconButton
            aria-label="スペクトログラム表示"
            aria-pressed={showSpectrogram}
            size="small"
            color={showSpectrogram ? 'primary' : 'default'}
            onClick={() => onShowSpectrogramChange(!showSpectrogram)}
          >
            <FontAwesomeIcon icon={faChartColumn} />
          </IconButton>
        </Tooltip>
        <Tooltip title="ピッチ表示">
          <IconButton
            aria-label="ピッチ表示"
            aria-pressed={showPitch}
            size="small"
            color={showPitch ? 'primary' : 'default'}
            onClick={() => onShowPitchChange(!showPitch)}
          >
            <FontAwesomeIcon icon={faMusic} />
          </IconButton>
        </Tooltip>
        {showPitch && (
          <Tooltip title="ピッチを描く（Shift: 半音に吸着 / Alt: 消す）">
            <IconButton
              aria-label="ピッチを描く"
              aria-pressed={penMode}
              size="small"
              color={penMode ? 'primary' : 'default'}
              onClick={() => onPenModeChange(!penMode)}
            >
              <FontAwesomeIcon icon={faPen} />
            </IconButton>
          </Tooltip>
        )}
        {showPitch && hasCurve && (
          <>
            <Button
              size="small"
              variant="contained"
              startIcon={<FontAwesomeIcon icon={faCheck} />}
              disabled={busy}
              onClick={onApplyCurve}
            >
              適用
            </Button>
            <Tooltip title="描いたピッチを破棄">
              <span>
                <IconButton aria-label="描いたピッチを破棄" size="small" disabled={busy} onClick={onClearCurve}>
                  <FontAwesomeIcon icon={faTrashCan} />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
        <Tooltip title="全体表示">
          <span>
            <IconButton aria-label="全体表示" size="small" disabled={!zoomed} onClick={() => setView({ start: 0, dur: duration })}>
              <FontAwesomeIcon icon={faExpand} />
            </IconButton>
          </span>
        </Tooltip>
        {/* 表示範囲の横スクロールバー */}
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
          {view.dur.toFixed(view.dur < 1 ? 3 : 1)}s
        </Typography>
      </Stack>
    </Box>
  )
}
