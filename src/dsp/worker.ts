// wasm の DSP エンジンをメインスレッド外で実行する Worker
import wasmUrl from './wevocal_dsp.wasm?url'

/** スペクトログラムの周波数方向の段数。Rust 側 `spec::ROWS` と一致させる */
export const SPEC_ROWS = 128

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
  process_curve_planar(
    input: number,
    frames: number,
    channels: number,
    sampleRate: number,
    ratios: number,
    ratioCount: number,
    hop: number,
    algorithm: number,
    preserveFormant: number,
    formantSemitones: number,
  ): number
  formant_curve_planar(input: number, frames: number, channels: number, sampleRate: number, shifts: number, shiftCount: number, hop: number): number
  analyze_f0(input: number, frames: number, sampleRate: number, minHz: number, maxHz: number, voicedLimit: number, silenceRms: number): number
  analyze_spectrogram(input: number, frames: number, sampleRate: number): number
  analyze_tempo(input: number, frames: number, sampleRate: number): number
  output_u8_ptr(): number
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
  /** 0 = WSOLA, 1 = Phase Vocoder, 2 = PSOLA, 3 = SOLA, 4 = PSOLAv2, 5 = WSOLAv2, 6 = Phase Vocoder v2（Rust 側 `Algorithm::from_id` と対応） */
  algorithm: number
  /** ピッチ変更時にフォルマントを保持し、`formantSemitones` だけ移動する */
  preserveFormant: boolean
  formantSemitones: number
}

/** F0 解析・スペクトログラム・テンポ解析のリクエスト（モノラル） */
export interface F0Request {
  kind: 'f0' | 'spec' | 'tempo'
  id: number
  samples: Float32Array
  sampleRate: number
  /** F0 解析の設定（kind が f0 のとき） */
  f0?: { minHz: number; maxHz: number; voicedLimit: number; silenceRms: number }
}

/** ピッチカーブ編集のリクエスト。`ratios[k]` は時刻 k × `hopSamples` のピッチ比 */
export interface CurveRequest {
  kind: 'curve'
  id: number
  channels: Float32Array[]
  sampleRate: number
  ratios: Float32Array
  hopSamples: number
  algorithm: number
  preserveFormant: boolean
  formantSemitones: number
}

/** フォルマントカーブ編集のリクエスト。`shifts[k]` は時刻 k × `hopSamples` のフォルマントのずらし量（半音） */
export interface FormantCurveRequest {
  kind: 'formant'
  id: number
  channels: Float32Array[]
  sampleRate: number
  shifts: Float32Array
  hopSamples: number
}

export type DspRequest = ProcessRequest | F0Request | CurveRequest | FormantCurveRequest

export type DspResponse =
  | { id: number; channels: Float32Array[] }
  | { id: number; bytes: Uint8Array }
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

function run(dsp: DspExports, req: ProcessRequest | CurveRequest | FormantCurveRequest): Float32Array[] {
  const frames = req.channels[0]?.length ?? 0
  const count = req.channels.length
  const total = frames * count
  const input = dsp.alloc_f32(total)
  try {
    const view = new Float32Array(dsp.memory.buffer, input, total)
    req.channels.forEach((c, i) => view.set(c, i * frames))
    const outFrames =
      req.kind === 'curve'
        ? runCurve(dsp, req, input, frames, count)
        : req.kind === 'formant'
          ? runFormant(dsp, req, input, frames, count)
        : dsp.process_planar(
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

function runCurve(dsp: DspExports, req: CurveRequest, input: number, frames: number, count: number): number {
  const n = req.ratios.length
  const ratios = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, ratios, n).set(req.ratios)
    return dsp.process_curve_planar(
      input,
      frames,
      count,
      req.sampleRate,
      ratios,
      n,
      req.hopSamples,
      req.algorithm,
      req.preserveFormant ? 1 : 0,
      req.formantSemitones,
    )
  } finally {
    dsp.free_f32(ratios, n)
  }
}

function runFormant(dsp: DspExports, req: FormantCurveRequest, input: number, frames: number, count: number): number {
  const n = req.shifts.length
  const shifts = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, shifts, n).set(req.shifts)
    return dsp.formant_curve_planar(input, frames, count, req.sampleRate, shifts, n, req.hopSamples)
  } finally {
    dsp.free_f32(shifts, n)
  }
}

/** スペクトログラム（フレームごとに ROWS バイト）を計算する */
function analyzeSpectrogram(dsp: DspExports, req: F0Request): Uint8Array {
  const n = req.samples.length
  const input = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, input, n).set(req.samples)
    const frames = dsp.analyze_spectrogram(input, n, req.sampleRate)
    return new Uint8Array(dsp.memory.buffer, dsp.output_u8_ptr(), frames * SPEC_ROWS).slice()
  } finally {
    dsp.free_f32(input, n)
  }
}

/** F0 解析とテンポ解析（どちらも結果は f32 の並び） */
function analyzeF0(dsp: DspExports, req: F0Request): Float32Array {
  const n = req.samples.length
  const input = dsp.alloc_f32(n)
  try {
    new Float32Array(dsp.memory.buffer, input, n).set(req.samples)
    const p = req.f0
    const count =
      req.kind === 'tempo'
        ? dsp.analyze_tempo(input, n, req.sampleRate)
        : dsp.analyze_f0(input, n, req.sampleRate, p?.minHz ?? 60, p?.maxHz ?? 1000, p?.voicedLimit ?? 0.35, p?.silenceRms ?? 0.003)
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
    if (req.kind === 'spec') {
      const bytes = analyzeSpectrogram(dsp, req)
      const res: DspResponse = { id: req.id, bytes }
      scope.postMessage(res, [bytes.buffer])
      return
    }
    const channels = 'samples' in req ? [analyzeF0(dsp, req)] : run(dsp, req)
    const res: DspResponse = { id: req.id, channels }
    scope.postMessage(res, channels.map((c) => c.buffer))
  } catch (err) {
    const res: DspResponse = { id: req.id, error: String(err) }
    scope.postMessage(res)
  }
}
