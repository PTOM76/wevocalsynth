import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { View } from './draw'

/** 表示できる最小の時間幅（秒） */
export const MIN_VIEW_SEC = 0.02
/** ボタン・ホイール1回あたりの拡大率 */
export const ZOOM_STEP = 1.5

/**
 * 波形の表示範囲（拡大縮小・スクロール）。クリップの長さ変更への追従、再生中の自動スクロール、
 * `canvasRef` 上のホイール操作（Ctrl/⌘ 併用で拡大縮小、それ以外は横スクロール）を扱う。
 */
export function useWaveformView(
  duration: number,
  position: number,
  playing: boolean,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const [view, setView] = useState<View>({ start: 0, dur: duration })

  // 表示範囲をクリップ内に収める
  const fit = useCallback(
    (start: number, dur: number): View => {
      const d = Math.min(duration, Math.max(Math.min(MIN_VIEW_SEC, duration), dur))
      return { start: Math.max(0, Math.min(duration - d, start)), dur: d }
    },
    [duration],
  )

  /** `center`（秒）を中心に `factor` 倍に拡大する（1未満なら縮小） */
  const zoomAround = useCallback(
    (factor: number, center: number) =>
      setView((v) => {
        const dur = v.dur / factor
        return fit(center - ((center - v.start) / v.dur) * dur, dur)
      }),
    [fit],
  )

  // クリップが変わったら、可能なら拡大率を保ち、無理なら全体表示にする
  useEffect(() => {
    setView((v) => (v.dur > duration || v.dur <= 0 ? { start: 0, dur: duration } : fit(v.start, v.dur)))
  }, [duration, fit])

  // 再生中は再生位置が画面内に収まるようにする
  useEffect(() => {
    if (!playing) return
    setView((v) => (position < v.start || position > v.start + v.dur ? fit(position, v.dur) : v))
  }, [position, playing, fit])

  // ページ自体がスクロール・拡大しないよう、ホイールは non-passive で登録する
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
  }, [canvasRef, fit, zoomAround])

  return {
    view,
    zoomAround,
    /** 表示開始位置を変える（スクロールバー用） */
    scrollTo: (start: number) => setView((v) => fit(start, v.dur)),
    showAll: () => setView({ start: 0, dur: duration }),
    zoomed: view.dur < duration - 1e-9,
  }
}
