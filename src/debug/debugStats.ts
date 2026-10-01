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

/**
 * JS の処理の記録（Chrome の JS Self-Profiling。サーバーが Document-Policy: js-profiling を返すときだけ使える）。
 * デバッグ表示を点けている間だけ 10ms ごとに記録し、画面が止まったら、その間に動いていた関数を数える。
 * 記録そのものがメモリを使う（いつも動かしたら 1GB 近くまで増えた）ので、短い間隔で捨てて取り直す
 */
interface ProfilerTrace {
  frames: { name: string; resourceId?: number; line?: number }[]
  stacks: { frameId: number; parentId?: number }[]
  samples: { timestamp: number; stackId?: number }[]
  resources: string[]
}
interface JsProfiler {
  stop(): Promise<ProfilerTrace>
}
type ProfilerCtor = new (o: { sampleInterval: number; maxBufferSize: number }) => JsProfiler
let profiler: JsProfiler | null = null
let profiling = false
const startProfiler = () => {
  if (!profiling) return
  const P = (globalThis as { Profiler?: ProfilerCtor }).Profiler
  try {
    profiler = P ? new P({ sampleInterval: 10, maxBufferSize: 2000 }) : null
  } catch {
    profiler = null
  }
}
let restartTimer = 0
/** デバッグ表示を点けたら記録を始め、消したらやめる */
export function setProfiling(on: boolean) {
  if (on === profiling) return
  profiling = on
  clearInterval(restartTimer)
  void profiler?.stop().catch(() => {})
  profiler = null
  if (!on) return
  startProfiler()
  // 記録が溜まりすぎないよう、ときどき捨てて取り直す
  restartTimer = window.setInterval(() => {
    void profiler?.stop().catch(() => {})
    startProfiler()
  }, 10_000)
}

/** `from`〜`to` の間に動いていた関数（一番上の関数ごとの割合。JS が動いていない時間は「JS 以外」） */
async function profileBetween(from: number, to: number): Promise<string[] | null> {
  const p = profiler
  if (!p) return null
  startProfiler()
  const trace = await p.stop()
  const inRange = trace.samples.filter((s) => s.timestamp >= from && s.timestamp <= to)
  if (!inRange.length) return null
  const counts = new Map<string, number>()
  for (const s of inRange) {
    let name = 'JS 以外（GC・描画など）'
    if (s.stackId !== undefined) {
      const f = trace.frames[trace.stacks[s.stackId].frameId]
      const file = f.resourceId !== undefined ? (trace.resources[f.resourceId] ?? '').split('/').pop()?.split('?')[0] : ''
      name = `${f.name || '(無名)'}${file ? ` ${file}:${f.line ?? ''}` : ''}`
    }
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n, c]) => `${n} ${Math.round((c / inRange.length) * 100)}%`)
}

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
      // 動いていた関数が分かれば書き足す
      const stall = stalls[0]
      void profileBetween(e.startTime, end).then((top) => {
        if (!top) return
        stall.during = [...stall.during, ...top.map((x) => `js: ${x}`)]
        console.warn('[stall] js', top)
      })
    }
  }).observe({ type: 'longtask', buffered: true })
} catch {
  // 長いタスクを測れないブラウザ（Safari・Firefox）では記録しない
}

/** 最近の、画面が止まった記録（新しい順） */
export function recentStalls(): readonly Stall[] {
  return stalls
}
