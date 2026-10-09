// 読みの帯（一音ずつの範囲を波形の下に並べ、端のドラッグで直す）
import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { canvasPixelRatio, localPoint, usePalette } from 'pevenmui'
import { timeToX, type View } from 'wevocal-lib'
import type { MoraMark } from '../audio/kanaCut'

/** 帯の高さ（px） */
const HEIGHT = 36
/** 端をつかめる距離（px） */
const GRAB_PX = 6
/** 一音の最短（秒） */
const MIN_SEC = 0.03

interface Props {
  morae: MoraMark[]
  view: View
  onChange: (morae: MoraMark[]) => void
  /** 一音を押したとき（その範囲を試聴する） */
  onPlay: (m: MoraMark) => void
}

/** つかんだ端（何番目の音の始まりか終わりか） */
type Grab = { index: number; edge: 'start' | 'end' }

/**
 * 読みの帯。一音ずつの範囲を波形の下に並べ、端のドラッグで直す（隣の音の端も一緒に動く）。
 * 確かでない音（境目がはっきりしない）は色を変える
 */
export default function MoraLane({ morae, view, onChange, onPlay }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { pal, font } = usePalette()
  const [width, setWidth] = useState(0)
  const [grab, setGrab] = useState<Grab | null>(null)
  const [hoverEdge, setHoverEdge] = useState(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ro = new ResizeObserver(() => setWidth(c.clientWidth))
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || width <= 0) return
    const dpr = canvasPixelRatio()
    c.width = Math.round(width * dpr)
    c.height = Math.round(HEIGHT * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, HEIGHT)
    g.font = `13px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const m of morae) {
      const x0 = timeToX(width, view, m.start)
      const x1 = timeToX(width, view, m.end)
      if (x1 < 0 || x0 > width) continue
      // 中身が読みと合わない音は赤、境目が確かでない音は橙
      const color = m.vowelOk === false ? pal.error.main : m.sure ? pal.primary.main : pal.warning.main
      g.fillStyle = color
      g.globalAlpha = 0.22
      g.fillRect(x0, 2, x1 - x0, HEIGHT - 4)
      g.globalAlpha = 1
      g.strokeStyle = color
      g.strokeRect(x0 + 0.5, 2.5, Math.max(0, x1 - x0 - 1), HEIGHT - 5)
      // 字が収まるときだけ書く
      if (x1 - x0 > 10) {
        g.fillStyle = pal.text.primary
        g.fillText(m.mora, (x0 + x1) / 2, HEIGHT / 2)
      }
    }
  }, [morae, view, width, pal, font])

  const timeAt = (clientX: number) => view.start + (localPoint(ref.current!, clientX, 0).x / width) * view.dur
  /** `clientX` の近くの端（なければ null） */
  const edgeAt = (clientX: number): Grab | null => {
    const x = localPoint(ref.current!, clientX, 0).x
    let best: Grab | null = null
    let bestD = GRAB_PX
    for (const [index, m] of morae.entries()) {
      for (const edge of ['start', 'end'] as const) {
        const d = Math.abs(timeToX(width, view, m[edge]) - x)
        if (d <= bestD) {
          best = { index, edge }
          bestD = d
        }
      }
    }
    return best
  }

  /** つかんだ端を `t` に動かす。隣の音とくっついている端は一緒に動かす */
  const move = (g: Grab, t: number) => {
    const next = morae.map((m) => ({ ...m }))
    const m = next[g.index]
    if (g.edge === 'start') {
      const prev = next[g.index - 1]
      const joined = prev && Math.abs(prev.end - m.start) < 1e-3
      const lo = prev ? (joined ? prev.start : prev.end) + MIN_SEC : 0
      m.start = Math.min(Math.max(t, lo), m.end - MIN_SEC)
      if (joined) prev.end = m.start
    } else {
      const after = next[g.index + 1]
      const joined = after && Math.abs(after.start - m.end) < 1e-3
      const hi = after ? (joined ? after.end : after.start) - MIN_SEC : Infinity
      m.end = Math.max(Math.min(t, hi), m.start + MIN_SEC)
      if (joined) after.start = m.end
    }
    // 直した音は確かなものとして扱う
    m.sure = true
    delete m.vowelOk
    onChange(next)
  }

  return (
    <Box sx={{ height: HEIGHT, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', cursor: grab || hoverEdge ? 'ew-resize' : 'pointer', touchAction: 'none' }}
        onPointerDown={(e) => {
          const g = edgeAt(e.clientX)
          if (g) {
            e.currentTarget.setPointerCapture(e.pointerId)
            setGrab(g)
            return
          }
          const t = timeAt(e.clientX)
          const m = morae.find((m) => t >= m.start && t < m.end)
          if (m) onPlay(m)
        }}
        onPointerMove={(e) => {
          if (grab) move(grab, timeAt(e.clientX))
          else setHoverEdge(!!edgeAt(e.clientX))
        }}
        onPointerUp={() => setGrab(null)}
        onPointerCancel={() => setGrab(null)}
      />
    </Box>
  )
}
