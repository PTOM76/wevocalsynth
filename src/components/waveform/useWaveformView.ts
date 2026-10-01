import { useCallback, useEffect, useState } from 'react'
import type { View } from './draw'

/** 表示できる最小の時間幅（秒） */
export const MIN_VIEW_SEC = 0.02
/** ボタン・ホイール1回あたりの拡大率 */
export const ZOOM_STEP = 1.5
/** 再生中に、再生位置が画面の外に出たか調べる間隔（ミリ秒） */
const FOLLOW_CHECK_MS = 50

/**
 * 波形の表示範囲（拡大縮小・スクロール）。クリップの長さ変更への追従と、再生中の自動スクロールを扱う。
 * ツールバーと波形の両方から操作するため、画面側（App）で持つ。
 */
export function useWaveformView(duration: number, livePosition: () => number, playing: boolean) {
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

  /** ホイール操作: Ctrl/⌘ 併用でカーソル位置を中心に拡大縮小、それ以外は横スクロール。`rect` は波形の位置 */
  const wheel = useCallback(
    (e: WheelEvent, rect: DOMRect) =>
      setView((v) => {
        if (e.ctrlKey || e.metaKey) {
          const center = v.start + ((e.clientX - rect.left) / rect.width) * v.dur
          const dur = v.dur / (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
          return fit(center - ((center - v.start) / v.dur) * dur, dur)
        }
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        return fit(v.start + (delta / rect.width) * v.dur, v.dur)
      }),
    [fit],
  )

  // クリップが変わったら、可能なら拡大率を保ち、無理なら全体表示にする
  useEffect(() => {
    setView((v) => (v.dur > duration || v.dur <= 0 ? { start: 0, dur: duration } : fit(v.start, v.dur)))
  }, [duration, fit])

  // 再生中は再生位置が画面内に収まるようにする
  // （今の位置を定期的に読み、画面の外に出たときだけ表示範囲を変える。中にいる間は描き直さない）
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const position = livePosition()
      setView((v) => (position < v.start || position > v.start + v.dur ? fit(position, v.dur) : v))
    }, FOLLOW_CHECK_MS)
    return () => clearInterval(timer)
  }, [livePosition, playing, fit])

  return {
    view,
    zoomAround,
    wheel,
    canZoomIn: view.dur > MIN_VIEW_SEC,
    /** 表示範囲を直接決める（ピンチ操作用。クリップ内に収める） */
    setRange: (start: number, dur: number) => setView(fit(start, dur)),
    /** 表示開始位置を変える（スクロールバー用） */
    scrollTo: (start: number) => setView((v) => fit(start, v.dur)),
    showAll: () => setView({ start: 0, dur: duration }),
    /** 時刻 `t` が画面の外なら、見える位置まで表示範囲を動かす（矢印キーで再生位置を動かしたときなど） */
    reveal: (t: number) => setView((v) => (t < v.start || t > v.start + v.dur ? fit(t - v.dur * 0.1, v.dur) : v)),
    zoomed: view.dur < duration - 1e-9,
  }
}
