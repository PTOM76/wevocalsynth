/**
 * デバッグ表示用の計測値。計測はいつも行う（数を足すだけなので軽い）ので、
 * 表示を点けた瞬間から直近の値が見られる
 */

/** 部品ごとの描画（React の render）回数の累計 */
const renders = new Map<string, number>()

/** 部品の描画を1回数える。部品の関数の先頭で呼ぶ */
export function countRender(name: string) {
  markActivity(`render ${name}`)
  renders.set(name, (renders.get(name) ?? 0) + 1)
}

export function renderCounts(): ReadonlyMap<string, number> {
  return renders
}

/** 持っている音声データの量（バイト）。何がメモリを使っているかの内訳を出すため */
const memory = new Map<string, number>()

/** `name` が今持っている音声データの量を記録する（0 なら消す） */
export function reportMemory(name: string, bytes: number) {
  if (bytes > 0) memory.set(name, bytes)
  else memory.delete(name)
}

export function memoryUsage(): ReadonlyMap<string, number> {
  return memory
}

/** クリップの音声データの量（バイト） */
export const clipBytes = (clip: { channels: Float32Array[] } | null | undefined) =>
  clip ? clip.channels.reduce((s, c) => s + c.byteLength, 0) : 0

/** DSP（Worker）の処理の記録 */
export interface DspJob {
  kind: string
  ms: number
  /** 処理した長さ（秒）。分かるときだけ */
  seconds?: number
}

const JOB_HISTORY = 5
const jobs: DspJob[] = []

/** DSP の処理が終わったときに記録する（新しい順に数件だけ残す） */
export function recordDspJob(job: DspJob) {
  jobs.unshift(job)
  jobs.length = Math.min(jobs.length, JOB_HISTORY)
}

export function recentDspJobs(): readonly DspJob[] {
  return jobs
}

/**
 * 画面が止まったときの原因探し。重くなりそうな処理の始まりに `markActivity` で印を付けておき、
 * 長いタスク（画面が止まった時間）と重なった印を一緒に記録する。表示を点けていなくても記録する
 */
const STALL_MS = 150
const marks: { name: string; t: number }[] = []
const MARK_HISTORY = 200

/** 重くなりそうな処理の始まりに呼ぶ（名前を付けるだけで軽い） */
export function markActivity(name: string) {
  marks.push({ name, t: performance.now() })
  if (marks.length > MARK_HISTORY) marks.splice(0, marks.length - MARK_HISTORY)
}

export interface Stall {
  /** 起きた時刻（ページを開いてからの秒） */
  at: number
  ms: number
  /** その間に始まった処理（同じものはまとめて回数を付ける） */
  during: string[]
  /** そのときの JS のメモリ（MB。Chrome だけ） */
  heapMb: number | null
}
const STALL_HISTORY = 8
const stalls: Stall[] = []

try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.duration < STALL_MS) continue
      const end = e.startTime + e.duration
      const names = marks.filter((m) => m.t >= e.startTime - 1 && m.t <= end).map((m) => m.name)
      const counted = [...new Set(names)].map((n) => {
        const c = names.filter((x) => x === n).length
        return c > 1 ? `${n}×${c}` : n
      })
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      // 印が無ければ、ガベージコレクション（メモリの掃除）や、印を付けていない処理
      stalls.unshift({ at: e.startTime / 1000, ms: e.duration, during: counted.length ? counted : ['(印のない処理)'], heapMb: mem ? mem.usedJSHeapSize / 2 ** 20 : null })
      stalls.length = Math.min(stalls.length, STALL_HISTORY)
      console.warn(`[stall] ${e.duration.toFixed(0)}ms`, counted)
    }
  }).observe({ type: 'longtask', buffered: true })
} catch {
  // 長いタスクを測れないブラウザ（Safari・Firefox）では記録しない
}

/** 最近の、画面が止まった記録（新しい順） */
export function recentStalls(): readonly Stall[] {
  return stalls
}
