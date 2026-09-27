import type { DspRequest, DspResponse } from './worker'

/** DSPエンジンの時間伸縮方式 */
export type Algorithm = 'wsola' | 'pv'

const ALGORITHM_ID: Record<Algorithm, number> = { wsola: 0, pv: 1 }

type Pending = {
  resolve: (c: Float32Array[]) => void
  reject: (e: Error) => void
  onProgress?: (p: number) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DspResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      if ('progress' in e.data) {
        p.onProgress?.(e.data.progress)
        return
      }
      pending.delete(e.data.id)
      if ('error' in e.data) p.reject(new Error(e.data.error))
      else p.resolve(e.data.channels)
    }
    worker.onerror = (e) => {
      pending.forEach((p) => p.reject(new Error(e.message || 'DSP worker error')))
      pending.clear()
    }
  }
  return worker
}

/** リクエストを Worker に送り、結果（チャンネル配列）を待つ */
function send(req: DspRequest, onProgress?: (p: number) => void): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject, onProgress })
    const buffers = req.kind === 'f0' ? [req.samples.buffer] : req.channels.map((c) => c.buffer)
    if (req.kind === 'curve') buffers.push(req.ratios.buffer)
    getWorker().postMessage(req, buffers)
  })
}

/** F0 の推定間隔（秒）。Rust 側 `f0::HOP_SEC` と一致させる */
export const F0_HOP_SEC = 0.01

/** 全チャンネルを平均したモノラル信号の F0 を推定する（Hz、無声は 0） */
export async function analyzeF0(channels: Float32Array[], sampleRate: number): Promise<Float32Array> {
  const len = channels[0]?.length ?? 0
  const samples = new Float32Array(len)
  for (const c of channels) for (let i = 0; i < len; i++) samples[i] += c[i] / channels.length
  const [f0] = await send({ kind: 'f0', id: nextId++, samples, sampleRate })
  return f0
}

export interface ProcessOptions {
  semitones: number
  stretch: number
  algorithm: Algorithm
  /** ピッチ変更時にフォルマントを保持する */
  preserveFormant: boolean
  /** フォルマントの追加移動量（半音、`preserveFormant` 時のみ有効） */
  formantSemitones: number
}

/** プレーナー形式の音声を DSP Worker でピッチ変更・時間伸縮する */
export function processAudio(
  channels: Float32Array[],
  sampleRate: number,
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  return send(
    {
      kind: 'process',
      id: nextId++,
      channels: channels.map((c) => c.slice()),
      sampleRate,
      ...opts,
      algorithm: ALGORITHM_ID[opts.algorithm],
    },
    onProgress,
  )
}

/**
 * ピッチカーブに従って、時間ごとに異なるピッチ変更を行う（長さは変わらない）。
 * `ratios[k]` は時刻 k × `F0_HOP_SEC` のピッチ比。
 */
export function processCurve(
  channels: Float32Array[],
  sampleRate: number,
  ratios: Float32Array,
  opts: Pick<ProcessOptions, 'algorithm' | 'preserveFormant' | 'formantSemitones'>,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  return send(
    {
      kind: 'curve',
      id: nextId++,
      channels: channels.map((c) => c.slice()),
      sampleRate,
      ratios: ratios.slice(),
      hopSamples: F0_HOP_SEC * sampleRate,
      algorithm: ALGORITHM_ID[opts.algorithm],
      preserveFormant: opts.preserveFormant,
      formantSemitones: opts.formantSemitones,
    },
    onProgress,
  )
}
