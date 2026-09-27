import { SPEC_ROWS, type DspRequest, type DspResponse } from './worker'

/** DSPエンジンの時間伸縮方式 */
/** wsola / pv は従来の方式、psola はボーカル向けの新しい方式（Rust 側 `Algorithm::from_id` と対応） */
export type Algorithm = 'wsola' | 'pv' | 'psola'

const ALGORITHM_ID: Record<Algorithm, number> = { wsola: 0, pv: 1, psola: 2 }

type Pending = {
  resolve: (r: Float32Array[] | Uint8Array) => void
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
      else p.resolve('bytes' in e.data ? e.data.bytes : e.data.channels)
    }
    worker.onerror = (e) => {
      pending.forEach((p) => p.reject(new Error(e.message || 'DSP worker error')))
      pending.clear()
    }
  }
  return worker
}

// 開発中、このファイルがホットリロードで入れ替わったら古い Worker を止める
// （止めないと WASM のメモリを抱えた Worker が書き換えのたびに増え、タブがメモリ不足で落ちる）
import.meta.hot?.dispose(() => {
  worker?.terminate()
  worker = null
})

/** リクエストを Worker に送り、結果（チャンネル配列）を待つ */
function send(req: DspRequest, onProgress?: (p: number) => void): Promise<Float32Array[]> {
  return sendRaw(req, onProgress) as Promise<Float32Array[]>
}

function sendRaw(req: DspRequest, onProgress?: (p: number) => void): Promise<Float32Array[] | Uint8Array> {
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject, onProgress })
    const buffers = 'samples' in req ? [req.samples.buffer] : req.channels.map((c) => c.buffer)
    if (req.kind === 'curve') buffers.push(req.ratios.buffer)
    getWorker().postMessage(req, buffers)
  })
}

/** F0 の推定間隔（秒）。Rust 側 `f0::HOP_SEC` と一致させる */
export const F0_HOP_SEC = 0.01

/** 全チャンネルを平均したモノラル信号 */
function mixDown(channels: Float32Array[]): Float32Array {
  const len = channels[0]?.length ?? 0
  const samples = new Float32Array(len)
  for (const c of channels) for (let i = 0; i < len; i++) samples[i] += c[i] / channels.length
  return samples
}

/** 全チャンネルを平均したモノラル信号の F0 を推定する（Hz、無声は 0） */
export async function analyzeF0(channels: Float32Array[], sampleRate: number): Promise<Float32Array> {
  const [f0] = await send({ kind: 'f0', id: nextId++, samples: mixDown(channels), sampleRate })
  return f0
}

/** スペクトログラム。`data[k * rows + r]`（r = 0 が最低周波数）が 0〜255 の明るさ */
export interface Spectrogram {
  data: Uint8Array
  frames: number
  rows: number
  /** フレーム間隔（秒）。フレーム k の中心は k × hopSec */
  hopSec: number
  minHz: number
  maxHz: number
}

/** Rust 側 `spec::HOP` / `spec::MIN_HZ` と一致させる */
const SPEC_HOP = 256
const SPEC_MIN_HZ = 50

export async function analyzeSpectrogram(channels: Float32Array[], sampleRate: number): Promise<Spectrogram> {
  const data = (await sendRaw({ kind: 'spec', id: nextId++, samples: mixDown(channels), sampleRate })) as Uint8Array
  return {
    data,
    frames: data.length / SPEC_ROWS,
    rows: SPEC_ROWS,
    hopSec: SPEC_HOP / sampleRate,
    minHz: SPEC_MIN_HZ,
    maxHz: sampleRate / 2,
  }
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
