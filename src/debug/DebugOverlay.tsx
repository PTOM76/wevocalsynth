import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { memoryUsage, recentDspJobs, renderCounts } from './debugStats'

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
 * 長いタスク・メモリ・DSP の処理時間を出す。操作の邪魔にならないよう、クリックは下に通す
 */
export default function DebugOverlay() {
  const [stats, setStats] = useState<Stats | null>(null)

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
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 2000,
        pointerEvents: 'none',
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
      {`  worst ${stats.worstFrame.toFixed(0)}ms\n`}
      {`long tasks ${stats.longTasks}${stats.longTasks ? ` (max ${stats.longestTask.toFixed(0)}ms)` : ''}\n`}
      {stats.heapMb !== null && `heap ${stats.heapMb.toFixed(0)}MB\n`}
      {stats.renders.map(([k, v]) => `render ${k} ${v.toFixed(1)}/s\n`).join('')}
      {[...memoryUsage()].map(([k, v]) => `mem ${k} ${(v / 2 ** 20).toFixed(0)}MB\n`).join('')}
      {jobs.map((j) => `dsp ${j.kind} ${j.ms.toFixed(0)}ms\n`).join('')}
    </Box>
  )
}
