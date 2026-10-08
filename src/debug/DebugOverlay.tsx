// デバッグ表示（FPS、描画回数、メモリ、DSP の時間）
import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { audioContextStates, memoryUsage, recentDspJobs, recentStalls, renderCounts } from './debugStats'
import { APP_BUILD } from '../pwa/updateCheck'

/** 表示を更新する間隔（ミリ秒）。数字が読める速さにする */
const UPDATE_MS = 500
/** 長いタスク（画面が固まる処理）とみなす長さ（ミリ秒）。ブラウザの Long Tasks と同じ */
const LONG_TASK_MS = 50

interface Stats {
  fps: number
  /** 直近の区間で一番長かったフレームの間隔（ミリ秒） */
  worstFrame: number
  /** 部品ごとの1秒あたりの描画回数 */
  renders: [string, number][]
  longTasks: number
  longestTask: number
  heapMb: number | null
}

/** Chrome だけにある performance.memory */
type MemoryInfo = { usedJSHeapSize: number }

/**
 * デバッグ表示（画面の左下）。FPS・一番重かったフレーム・部品の描画回数・
 * 長いタスク・メモリ・DSP の処理時間・画面が止まった記録を出す。文字は選んでコピーできる（不具合の報告に貼る）
 */
export default function DebugOverlay() {
  const [stats, setStats] = useState<Stats | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // ドラッグで選んでいる途中も書き換えない
  const pressing = useRef(false)
  useEffect(() => {
    const up = () => (pressing.current = false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  useEffect(() => {
    let frames = 0
    let worst = 0
    let prev = performance.now()
    let raf = 0
    const frame = (now: number) => {
      frames++
      worst = Math.max(worst, now - prev)
      prev = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // 長いタスク（対応していないブラウザでは数えない）
    let longTasks = 0
    let longest = 0
    let observer: PerformanceObserver | null = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < LONG_TASK_MS) continue
          longTasks++
          longest = Math.max(longest, e.duration)
        }
      })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {
      observer = null
    }

    let lastCounts = new Map(renderCounts())
    let lastTime = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const sec = (now - lastTime) / 1000
      const counts = renderCounts()
      const renders: [string, number][] = [...counts].map(([k, v]) => [k, (v - (lastCounts.get(k) ?? 0)) / sec])
      const memory = (performance as Performance & { memory?: MemoryInfo }).memory
      // 表示の中の文字を選んでいる間は書き換えない（書き換えると選択が外れてコピーできない）
      const sel = window.getSelection()
      const selecting = !!sel && !sel.isCollapsed && !!boxRef.current?.contains(sel.anchorNode)
      if (!selecting && !pressing.current)
        setStats({
          fps: frames / sec,
          worstFrame: worst,
          renders,
          longTasks,
          longestTask: longest,
          heapMb: memory ? memory.usedJSHeapSize / 2 ** 20 : null,
        })
      frames = 0
      worst = 0
      longTasks = 0
      longest = 0
      lastCounts = new Map(counts)
      lastTime = now
    }, UPDATE_MS)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      observer?.disconnect()
    }
  }, [])

  if (!stats) return null
  const jobs = recentDspJobs()
  // 60fps を下回ったら黄、30fps を下回ったら赤
  const fpsColor = stats.fps >= 55 ? '#8f8' : stats.fps >= 30 ? '#ff8' : '#f88'
  const lines = [
    `long tasks ${stats.longTasks}${stats.longTasks ? ` (max ${stats.longestTask.toFixed(0)}ms)` : ''}`,
    ...(stats.heapMb !== null ? [`heap ${stats.heapMb.toFixed(0)}MB`] : []),
    ...stats.renders.map(([k, v]) => `render ${k} ${v.toFixed(1)}/s`),
    ...[...memoryUsage()].map(([k, v]) => `mem ${k} ${(v / 2 ** 20).toFixed(0)}MB`),
    // アプリが把握している分の合計（音声データと、DSP の Worker の wasm）。iOS などブラウザのメモリ量（heap）が見えない環境の目安
    ...(memoryUsage().size ? [`mem total ${([...memoryUsage().values()].reduce((a, b) => a + b, 0) / 2 ** 20).toFixed(0)}MB`] : []),
    ...jobs.map((j) => `dsp ${j.kind} ${j.ms.toFixed(0)}ms`),
    ...audioContextStates(),
    // 画面が止まった記録と、その間に始まった処理
    ...recentStalls().map(
      (st) => `stall ${st.ms.toFixed(0)}ms @${st.at.toFixed(0)}s${st.heapMb !== null ? ` heap ${st.heapMb.toFixed(0)}MB` : ''}: ${st.during.join(', ')}`,
    ),
  ]
  return (
    <Box
      ref={boxRef}
      onPointerDown={() => (pressing.current = true)}
      sx={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 2000,
        // 文字を選んでコピーできるようにする（不具合の報告に貼る）
        userSelect: 'text',
        WebkitUserSelect: 'text',
        cursor: 'text',
        px: 1,
        py: 0.5,
        borderRadius: 0.5,
        bgcolor: 'rgba(0, 0, 0, 0.72)',
        color: '#eee',
        font: '11px/1.45 ui-monospace, Consolas, monospace',
        whiteSpace: 'pre',
      }}
    >
      <Box component="span" sx={{ color: fpsColor }}>
        {`FPS ${stats.fps.toFixed(0)}`}
      </Box>
      {`  worst ${stats.worstFrame.toFixed(0)}ms`}
      {'\n' + [...lines, `build ${APP_BUILD}`].join('\n')}
    </Box>
  )
}
