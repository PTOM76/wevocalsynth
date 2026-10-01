import { SPEC_ROWS, type DspRequest, type DspResponse } from './worker'
import { markActivity, recordDspJob } from '../debug/debugStats'

/** DSPエンジンの時間伸縮方式 */
/** wsola / pv は従来の方式、psola はボーカル向けの新しい方式（Rust 側 `Algorithm::from_id` と対応） */
export type Algorithm = 'wsola' | 'pv' | 'psola' | 'sola'

const ALGORITHM_ID: Record<Algorithm, number> = { wsola: 0, pv: 1, psola: 2, sola: 3 }

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

/**
 * 処理中のものをすべて中断する（Worker ごと止める。待っている呼び出しは失敗する）。
 * Worker は次のリクエストで作り直される（wasm の読み込みに少しかかる）
 */
/** 中断（`cancelDsp`）で失敗したか。通知せずに済ませるのに使う */
export const isCancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function cancelDsp() {
  if (!worker) return
  worker.terminate()
  worker = null
  pending.forEach((p) => p.reject(new DOMException('cancelled', 'AbortError')))
  pending.clear()
}

/** リクエストを Worker に送り、結果（チャンネル配列）を待つ */
function send(req: DspRequest, onProgress?: (p: number) => void): Promise<Float32Array[]> {
  return sendRaw(req, onProgress) as Promise<Float32Array[]>
}

function sendRaw(req: DspRequest, onProgress?: (p: number) => void): Promise<Float32Array[] | Uint8Array> {
  const t0 = performance.now()
  markActivity(`dsp ${req.kind}`)
  // デバッグ表示用に、処理の種類と所要時間を記録する
  const done = () => recordDspJob({ kind: req.kind, ms: performance.now() - t0 })
  return new Promise((resolve, reject) => {
    pending.set(req.id, {
      resolve: (v) => {
        done()
        resolve(v)
      },
      reject,
      onProgress,
    })
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

/** F0 解析の設定（Rust 側 `f0::Params` と対応） */
export interface F0Params {
  minHz: number
  maxHz: number
  /** 有声とみなす谷の深さの上限（大きいほどゆるい） */
  voicedLimit: number
  /** 無音とみなす音量（RMS） */
  silenceRms: number
}

/** 既定の F0 解析の設定。自動判定・範囲の音程表示はいつもこれを使う */
export const DEFAULT_F0_PARAMS: F0Params = { minHz: 60, maxHz: 1000, voicedLimit: 0.35, silenceRms: 0.003 }

/** 全チャンネルを平均したモノラル信号の F0 を推定する（Hz、無声は 0） */
export async function analyzeF0(channels: Float32Array[], sampleRate: number, params: F0Params = DEFAULT_F0_PARAMS): Promise<Float32Array> {
  const [f0] = await send({ kind: 'f0', id: nextId++, samples: mixDown(channels), sampleRate, f0: params })
  return f0
}

/** テンポの候補。強さは一番強い候補を 1 とした比、`offset` はその BPM での1拍目の位置（秒） */
export interface TempoCandidate {
  bpm: number
  strength: number
  offset: number
}

/** 全チャンネルを平均したモノラル信号のテンポ（BPM）の候補を、強い順に返す */
export async function analyzeTempo(channels: Float32Array[], sampleRate: number): Promise<TempoCandidate[]> {
  const [raw] = await send({ kind: 'tempo', id: nextId++, samples: mixDown(channels), sampleRate })
  const out: TempoCandidate[] = []
  for (let i = 0; i + 2 < raw.length; i += 3) out.push({ bpm: raw[i], strength: raw[i + 1], offset: raw[i + 2] })
  return out
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

/** フォルマントだけを、フレームごとの量（`shifts` 半音、`hopSec` 間隔）だけずらす。ピッチと長さは変えない */
export function processFormantCurve(
  channels: Float32Array[],
  sampleRate: number,
  shifts: Float32Array,
  hopSec: number,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  return send(
    { kind: 'formant', id: nextId++, channels: channels.map((c) => c.slice()), sampleRate, shifts: shifts.slice(), hopSamples: hopSec * sampleRate },
    onProgress,
  )
}
