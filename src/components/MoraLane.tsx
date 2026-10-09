// 読みの帯（一音ずつの範囲を波形の下に並べ、端のドラッグで直す。ダブルクリックで読みの変更、右クリックで削除）
import { useEffect, useRef, useState } from 'react'
import { Box, InputBase, Menu, MenuItem } from '@mui/material'
import { canvasPixelRatio, localPoint, pevenFont, usePalette } from 'pevenmui'
import { timeToX, type View } from 'wevocal-lib'
import type { MoraMark } from '../audio/kanaCut'
import { t } from '../i18n/i18n'

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
  /** 端をつかんでいるか端に乗っているときの時刻（秒。なければ null）。波形に縦の線を引くのに使う */
  onGuide?: (t: number | null) => void
}

/** つかんだ端（何番目の音の始まりか終わりか） */
type Grab = { index: number; edge: 'start' | 'end' }

/**
 * 読みの帯。一音ずつの範囲を波形の下に並べ、端のドラッグで直す（隣の音の端も一緒に動く）。
 * 確かでない音（境目がはっきりしない）は色を変える
 */
export default function MoraLane({ morae, view, onChange, onPlay, onGuide }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { pal, font } = usePalette()
  const [width, setWidth] = useState(0)
  const [grab, setGrab] = useState<Grab | null>(null)
  const [hoverEdge, setHoverEdge] = useState(false)
  /** 読みを変更している音（何番目か） */
  const [editing, setEditing] = useState<number | null>(null)
  /** 右クリックのメニュー（何番目の音か、出す位置） */
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null)

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

  /** `clientX` の所の音（何番目か。なければ -1） */
  const indexAt = (clientX: number) => {
    const at = timeAt(clientX)
    return morae.findIndex((m) => at >= m.start && at < m.end)
  }

  /** `index` 番目の音の読みを `text` にする。空なら削除する。直した音は確かなものとして扱う */
  const rename = (index: number, text: string) => {
    const mora = text.trim()
    if (!mora) return onChange(morae.filter((_, i) => i !== index))
    if (mora === morae[index].mora) return
    onChange(morae.map((m, i) => (i === index ? { start: m.start, end: m.end, mora, sure: true } : m)))
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
    onGuide?.(m[g.edge])
    onChange(next)
  }

  return (
    <Box sx={{ position: 'relative', height: HEIGHT, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
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
          if (e.button !== 0) return
          const i = indexAt(e.clientX)
          if (i >= 0) onPlay(morae[i])
        }}
        onDoubleClick={(e) => {
          const i = indexAt(e.clientX)
          if (i >= 0) setEditing(i)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          const i = indexAt(e.clientX)
          if (i >= 0) setMenu({ index: i, x: e.clientX, y: e.clientY })
        }}
        onPointerMove={(e) => {
          if (grab) {
            move(grab, timeAt(e.clientX))
            return
          }
          const g = edgeAt(e.clientX)
          setHoverEdge(!!g)
          onGuide?.(g ? morae[g.index][g.edge] : null)
        }}
        onPointerUp={() => setGrab(null)}
        onPointerCancel={() => setGrab(null)}
        onPointerLeave={() => !grab && onGuide?.(null)}
      />
      {editing !== null && morae[editing] && (
        <InputBase
          autoFocus
          defaultValue={morae[editing].mora}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            rename(editing, e.target.value)
            setEditing(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.querySelector('input')?.blur()
            if (e.key === 'Escape') setEditing(null)
            e.stopPropagation()
          }}
          inputProps={{ style: { textAlign: 'center', padding: 0 } }}
          sx={() => {
            const x0 = Math.max(0, timeToX(width, view, morae[editing].start))
            const x1 = Math.min(width, timeToX(width, view, morae[editing].end))
            return { position: 'absolute', top: 2, left: x0, width: Math.max(48, x1 - x0), height: HEIGHT - 4, bgcolor: 'background.paper', border: 1, borderColor: 'primary.main', fontSize: pevenFont('base') }
          }}
        />
      )}
      <Menu open={!!menu} onClose={() => setMenu(null)} anchorReference="anchorPosition" anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}>
        <MenuItem
          onClick={() => {
            setEditing(menu!.index)
            setMenu(null)
          }}
        >
          {t('kanaCut.editMora')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            rename(menu!.index, '')
            setMenu(null)
          }}
        >
          {t('edit.delete')}
        </MenuItem>
      </Menu>
    </Box>
  )
}
