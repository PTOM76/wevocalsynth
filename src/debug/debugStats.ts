/**
 * デバッグ表示用の計測値。計測はいつも行う（数を足すだけなので軽い）ので、
 * 表示を点けた瞬間から直近の値が見られる
 */

/** 部品ごとの描画（React の render）回数の累計 */
const renders = new Map<string, number>()

/** 部品の描画を1回数える。部品の関数の先頭で呼ぶ */
export function countRender(name: string) {
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
