import { useCallback, useRef, useState } from 'react'
import { Box } from '@mui/material'

/** localStorage に数値を保存する（使えない環境ではこのセッション中だけ覚える） */
export function usePersistentNumber(key: string, initial: number) {
  const [value, setValue] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key))
      return Number.isFinite(v) && v > 0 ? v : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: number) => {
      setValue(v)
      try {
        localStorage.setItem(key, String(Math.round(v)))
      } catch {
        // 保存できなくても、このセッション中は使う
      }
    },
    [key],
  )
  return [value, set] as const
}

/**
 * 右側パネルの幅を変える分割バー。デスクトップアプリと同じく、ドラッグ・キーボード（← →）・
 * ダブルクリック（元の幅に戻す）で操作でき、幅は次回も引き継ぐ
 */
export function usePanelWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = usePersistentNumber(key, initial)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const dragRef = useRef<{ x: number; w: number } | null>(null)

  const bar = (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { x: e.clientX, w: width }
      }}
      // 右側のパネルなので、左へ動かすと広がる
      onPointerMove={(e) => dragRef.current && setWidth(clamp(dragRef.current.w - (e.clientX - dragRef.current.x)))}
      onPointerUp={() => {
        dragRef.current = null
      }}
      onDoubleClick={() => setWidth(initial)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setWidth(clamp(width + 16))
        else if (e.key === 'ArrowRight') setWidth(clamp(width - 16))
      }}
      sx={{
        width: 5,
        flexShrink: 0,
        cursor: 'col-resize',
        bgcolor: 'divider',
        touchAction: 'none',
        transition: 'background-color 80ms',
        '&:hover, &:focus-visible, &:active': { bgcolor: 'primary.main', outline: 'none' },
      }}
    />
  )
  return { width: clamp(width), bar }
}
