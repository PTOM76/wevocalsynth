// wasm の DSP エンジンをメインスレッド外で実行する Worker
import wasmUrl from './wevocal_dsp.wasm?url'

interface DspExports {
  memory: WebAssembly.Memory
  alloc_f32(len: number): number
  free_f32(ptr: number, len: number): void
  process_planar(
    input: number,
    frames: number,
    channels: number,
    sampleRate: number,
    semitones: number,
    stretch: number,
    algorithm: number,
    preserveFormant: number,
    formantSemitones: number,
  ): number
  analyze_f0(input: number, frames: number, sampleRate: number): number
  output_ptr(): number
}

/** ピッチ変更・時間伸縮のリクエスト */
export interface ProcessRequest {
  kind: 'process'
  id: number
  channels: Float32Array[]
  sampleRate: number
  semitones: number
  stretch: number
  /** 0 = WSOLA, 1 = Phase Vocoder（Rust 側 `Algorithm::from_id` と対応） */
  algorithm: number
  /** ピッチ変更時にフォルマントを保持し、`formantSemitones` だけ移動する */
  preserveFormant: boolean
  formantSemitones: number
}

/** F0 解析のリクエスト（モノラル） */
export interface F0Request {
  kind: 'f0'
  id: number
  samples: Float32Array
  sampleRate: number
}

export type DspRequest = ProcessRequest | F0Request

export type DspResponse =
  | { id: number; channels: Float32Array[] }
  | { id: number; error: string }
  | { id: number; progress: number }

// Worker のグローバルは Worker と同じメッセージ API を持つ。webworker lib を読み込まずに済ませるためのキャスト
const scope = self as unknown as Worker

// 処理中のリクエストID。wasm からの進捗通知に付与する
let currentId = 0
let lastProgress = -1

function reportProgress(p: number) {
  // 1%単位に間引いて送る
  const pct = Math.floor(p * 100)
  if (pct === lastProgress) return
  lastProgress = pct
  const res: DspResponse = { id: currentId, progress: p }
  scope.postMessage(res)
}

const ready: Promise<DspExports> = fetch(wasmUrl)
  .then((r) => r.arrayBuffer())
  .then((bytes) => WebAssembly.instantiate(bytes, { env: { report_progress: reportProgress } }))
  .then((r) => r.instance.exports as unknown as DspExports)

function run(dsp: DspExports, req: ProcessRequest): Float32Array[] {
  const frames = req.channels[0]?.length ?? 0
  const count = req.channels.length
  const total = frames * count
  const input = dsp.alloc_f32(total)
  try {
    const view = new Float32Array(dsp.memory.buffer, input, total)
    req.channels.forEach((c, i) => view.set(c, i * frames))
    const outFrames = dsp.process_planar(
      input,
      frames,
      count,
      req.sampleRate,
      req.semitones,
      req.stretch,
      req.algorithm,
      req.preserveFormant ? 1 : 0,
      req.formantSemitones,
    )
    // 処理中にメモリが拡張されている可能性があるため、ビューは処理後に作り直す
    const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), outFrames * count)
    return Array.from({ length: count }, (_, i) => out.slice(i * outFrames, (i + 1) * outFrames))
  } finally {
    dsp.free_f32(input, total)
  }
}

function analyzeF0(dsp: DspExports, req: F0Request): Float32Array {
  const n = req.samples.length
  const input = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, input, n).set(req.samples)
    const count = dsp.analyze_f0(input, n, req.sampleRate)
    return new Float32Array(dsp.memory.buffer, dsp.output_ptr(), count).slice()
  } finally {
    dsp.free_f32(input, n)
  }
}

scope.onmessage = async (e: MessageEvent<DspRequest>) => {
  const req = e.data
  try {
    const dsp = await ready
    currentId = req.id
    lastProgress = -1
    const channels = req.kind === 'f0' ? [analyzeF0(dsp, req)] : run(dsp, req)
    const res: DspResponse = { id: req.id, channels }
    scope.postMessage(res, channels.map((c) => c.buffer))
  } catch (err) {
    const res: DspResponse = { id: req.id, error: String(err) }
    scope.postMessage(res)
  }
}
