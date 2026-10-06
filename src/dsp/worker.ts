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
  analyze_tempo(input: number, frames: number, sampleRate: number): number
  split_voices_planar(input: number, frames: number, channels: number, sampleRate: number, by: number): number
  kana_vowel_demo(input: number, frames: number, sampleRate: number, from: number, strength: number): number
  segment_count(frames: number, sampleRate: number): number
  segment_bound(frames: number, sampleRate: number, k: number, field: number): number
  stitch_planar(input: number, frames: number, channels: number, sampleRate: number, stretch: number): number
  output_ptr(): number
  set_fast_math(on: number): void
}

/** ピッチ変更・時間伸縮のリクエスト */
export interface ProcessRequest {
  kind: 'process'
  id: number
  channels: Float32Array[]
  sampleRate: number
  semitones: number
  stretch: number
  /** 0 = WSOLA, 1 = Phase Vocoder, 2 = PSOLA, 3 = SOLA, 4 = PSOLAv2, 5 = WSOLAv2, 6 = Phase Vocoder v2, 7 = HPSS, 8 = SOLAv2, 9 = SOLAv3（Rust 側 `Algorithm::from_id` と対応） */
  algorithm: number
  /** ピッチ変更時にフォルマントを保持し、`formantSemitones` だけ移動する */
  preserveFormant: boolean
  formantSemitones: number
  /** フォルマント補正で速い対数・指数の近似を使うか（省略なら使う） */
  fastMath?: boolean
}

/** F0 解析・テンポ解析・母音の作り直しの試し（kana）のリクエスト（モノラル） */
export interface F0Request {
  kind: 'f0' | 'tempo' | 'kana'
  id: number
  samples: Float32Array
  sampleRate: number
  /** 素材の母音（kind が kana のとき。0〜4 が あ〜お） */
  vowel?: number
  /** 響きを動かす強さ（kind が kana のとき。0〜1） */
  strength?: number
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
  fastMath?: boolean
}

/** フォルマントカーブ編集のリクエスト。`shifts[k]` は時刻 k × `hopSamples` のフォルマントのずらし量（半音） */
export interface FormantCurveRequest {
  kind: 'formant'
  id: number
  channels: Float32Array[]
  sampleRate: number
  shifts: Float32Array
  hopSamples: number
  fastMath?: boolean
}

/** 和音を 2 つの声に分けるリクエスト（試作）。結果は A の全チャンネル、B の全チャンネルの順 */
export interface VoicesRequest {
  kind: 'voices'
  id: number
  channels: Float32Array[]
  sampleRate: number
  /** 0 = 高さ（A が高い方）、1 = 音量（A が大きい方）。Rust 側 `voices::SplitBy` と対応 */
  by: number
  fastMath?: boolean
}

/** 区間に分けて並列に加工するときの区間の割り当て（試験的。結果は [start, end, ctxStart, ctxEnd] を区間の数だけ並べたもの） */
export interface SegmentPlanRequest {
  kind: 'segplan'
  id: number
  frames: number
  sampleRate: number
}

/** 区間ごとに加工した音をつなぐ（試験的）。`channels` は区間の順、その中はチャンネルの順 */
export interface StitchRequest {
  kind: 'stitch'
  id: number
  channels: Float32Array[]
  frames: number
  channelCount: number
  sampleRate: number
  stretch: number
}

export type DspRequest = ProcessRequest | F0Request | CurveRequest | FormantCurveRequest | VoicesRequest | SegmentPlanRequest | StitchRequest

export type DspResponse =
  | { id: number; channels: Float32Array[] }
  | { id: number; error: string }
  | { id: number; progress: number }
  /** 処理のあとの wasm のメモリの大きさ（バイト。デバッグ表示用。wasm のメモリは縮まない） */
  | { id: number; wasmBytes: number }

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

function run(dsp: DspExports, req: ProcessRequest | CurveRequest | FormantCurveRequest | VoicesRequest): Float32Array[] {
  const frames = req.channels[0]?.length ?? 0
  const count = req.channels.length
  const total = frames * count
  dsp.set_fast_math(req.fastMath === false ? 0 : 1)
  const input = dsp.alloc_f32(total)
  try {
    const view = new Float32Array(dsp.memory.buffer, input, total)
    req.channels.forEach((c, i) => view.set(c, i * frames))
    const outFrames =
      req.kind === 'curve'
        ? runCurve(dsp, req, input, frames, count)
        : req.kind === 'formant'
          ? runFormant(dsp, req, input, frames, count)
        : req.kind === 'voices'
          ? dsp.split_voices_planar(input, frames, count, req.sampleRate, req.by)
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
    // 和音を分けたときは、A と B の 2 組
    const outCount = req.kind === 'voices' ? count * 2 : count
    const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), outFrames * outCount)
    return Array.from({ length: outCount }, (_, i) => out.slice(i * outFrames, (i + 1) * outFrames))
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

/** 区間ごとに加工した音をつなぐ */
function stitch(dsp: DspExports, req: StitchRequest): Float32Array[] {
  const total = req.channels.reduce((n, c) => n + c.length, 0)
  const input = dsp.alloc_f32(total)
  try {
    const view = new Float32Array(dsp.memory.buffer, input, total)
    let at = 0
    for (const c of req.channels) {
      view.set(c, at)
      at += c.length
    }
    const outFrames = dsp.stitch_planar(input, req.frames, req.channelCount, req.sampleRate, req.stretch)
    const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), outFrames * req.channelCount)
    return Array.from({ length: req.channelCount }, (_, i) => out.slice(i * outFrames, (i + 1) * outFrames))
  } finally {
    dsp.free_f32(input, total)
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
        : req.kind === 'kana'
          ? dsp.kana_vowel_demo(input, n, req.sampleRate, req.vowel ?? 0, req.strength ?? 1)
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
    if (req.kind === 'segplan') {
      const n = dsp.segment_count(req.frames, req.sampleRate)
      const plan = new Float64Array(n * 4)
      for (let k = 0; k < n; k++) for (let f = 0; f < 4; f++) plan[k * 4 + f] = dsp.segment_bound(req.frames, req.sampleRate, k, f)
      // 区間の境界は Float64 で返す（Float32 では 5 分を超える位置が丸まる）
      scope.postMessage({ id: req.id, channels: [new Float32Array(plan.buffer)] } satisfies DspResponse, [plan.buffer])
      return
    }
    if (req.kind === 'stitch') {
      const channels = stitch(dsp, req)
      scope.postMessage({ id: req.id, channels } satisfies DspResponse, channels.map((c) => c.buffer))
      return
    }
    const channels = 'samples' in req ? [analyzeF0(dsp, req)] : run(dsp, req)
    const res: DspResponse = { id: req.id, channels }
    scope.postMessage(res, channels.map((c) => c.buffer))
  } catch (err) {
    const res: DspResponse = { id: req.id, error: String(err) }
    scope.postMessage(res)
  } finally {
    const dsp = await ready.catch(() => null)
    if (dsp) scope.postMessage({ id: -1, wasmBytes: dsp.memory.buffer.byteLength } satisfies DspResponse)
  }
}
