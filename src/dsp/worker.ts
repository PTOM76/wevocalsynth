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

/** 音声（チャンネルごとの配列）と、その設定 */
interface Audio {
  channels: Float32Array[]
  sampleRate: number
  /** フォルマント補正で速い対数・指数の近似を使うか（省略なら使う） */
  fastMath?: boolean
}

/** モノラルの音声（解析用） */
interface Mono {
  samples: Float32Array
  sampleRate: number
}

/** `data` を wasm のメモリにコピーして `fn` に渡し、終わったら解放する */
function withF32<T>(dsp: DspExports, data: Float32Array, fn: (ptr: number) => T): T {
  const ptr = dsp.alloc_f32(data.length)
  try {
    new Float32Array(dsp.memory.buffer, ptr, data.length).set(data)
    return fn(ptr)
  } finally {
    dsp.free_f32(ptr, data.length)
  }
}

/** チャンネルを並べて 1 つの配列にする（wasm の planar 形式） */
function concat(channels: Float32Array[]): Float32Array {
  const out = new Float32Array(channels.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of channels) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** 出力（output_ptr）から `count` 個のチャンネルを読む。処理中にメモリが拡張されることがあるので、ビューは処理後に作る */
function readPlanar(dsp: DspExports, frames: number, count: number): Float32Array[] {
  const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), frames * count)
  return Array.from({ length: count }, (_, i) => out.slice(i * frames, (i + 1) * frames))
}

/** 出力（output_ptr）から `count` 個の値を読む */
const readF32 = (dsp: DspExports, count: number) => new Float32Array(dsp.memory.buffer, dsp.output_ptr(), count).slice()

/** 音声を wasm に渡して `fn` で加工し、`outCount` 個のチャンネルを読む（`fn` は出力のフレーム数を返す） */
function planar(dsp: DspExports, a: Audio, fn: (input: number, frames: number, count: number) => number, outCount = a.channels.length): Float32Array[] {
  dsp.set_fast_math(a.fastMath === false ? 0 : 1)
  const frames = a.channels[0]?.length ?? 0
  return withF32(dsp, concat(a.channels), (input) => readPlanar(dsp, fn(input, frames, a.channels.length), outCount))
}

/** モノラルの音声を wasm に渡して `fn` で解析し、結果の値を読む（`fn` は値の数を返す） */
const mono = (dsp: DspExports, m: Mono, fn: (input: number, n: number) => number) => [withF32(dsp, m.samples, (input) => readF32(dsp, fn(input, m.samples.length)))]

/**
 * Worker でできる処理の表（名前 → wasm の呼び出し）。処理を足すときは、ffi.rs、DspExports、ここ、engine.ts の関数に足す。
 * リクエストの型（DspRequest）は、ここの引数の型から作る
 */
const OPS = {
  /** ピッチ変更・時間伸縮。algorithm は Rust 側 `Algorithm::from_id` の番号（engine.ts の ALGORITHM_ID） */
  process: (dsp: DspExports, r: Audio & { semitones: number; stretch: number; algorithm: number; preserveFormant: boolean; formantSemitones: number }) =>
    planar(dsp, r, (input, frames, count) =>
      dsp.process_planar(input, frames, count, r.sampleRate, r.semitones, r.stretch, r.algorithm, r.preserveFormant ? 1 : 0, r.formantSemitones),
    ),
  /** ピッチカーブ編集。`ratios[k]` は時刻 k × `hopSamples` のピッチ比 */
  curve: (dsp: DspExports, r: Audio & { ratios: Float32Array; hopSamples: number; algorithm: number; preserveFormant: boolean; formantSemitones: number }) =>
    planar(dsp, r, (input, frames, count) =>
      withF32(dsp, r.ratios, (ratios) =>
        dsp.process_curve_planar(input, frames, count, r.sampleRate, ratios, r.ratios.length, r.hopSamples, r.algorithm, r.preserveFormant ? 1 : 0, r.formantSemitones),
      ),
    ),
  /** フォルマントカーブ編集。`shifts[k]` は時刻 k × `hopSamples` のフォルマントのずらし量（半音） */
  formant: (dsp: DspExports, r: Audio & { shifts: Float32Array; hopSamples: number }) =>
    planar(dsp, r, (input, frames, count) =>
      withF32(dsp, r.shifts, (shifts) => dsp.formant_curve_planar(input, frames, count, r.sampleRate, shifts, r.shifts.length, r.hopSamples)),
    ),
  /** 和音を 2 つの声に分ける（試作）。by は 0 = 高さ、1 = 音量（Rust 側 `voices::SplitBy`）。結果は A の全チャンネル、B の全チャンネルの順 */
  voices: (dsp: DspExports, r: Audio & { by: number }) =>
    planar(dsp, r, (input, frames, count) => dsp.split_voices_planar(input, frames, count, r.sampleRate, r.by), r.channels.length * 2),
  /** F0 解析 */
  f0: (dsp: DspExports, r: Mono & { f0?: { minHz: number; maxHz: number; voicedLimit: number; silenceRms: number } }) =>
    mono(dsp, r, (input, n) =>
      dsp.analyze_f0(input, n, r.sampleRate, r.f0?.minHz ?? 60, r.f0?.maxHz ?? 1000, r.f0?.voicedLimit ?? 0.35, r.f0?.silenceRms ?? 0.003),
    ),
  /** テンポ解析 */
  tempo: (dsp: DspExports, r: Mono) => mono(dsp, r, (input, n) => dsp.analyze_tempo(input, n, r.sampleRate)),
  /** 母音の作り直しの試し（kana）。vowel は 0〜4 が あ〜お、strength は 0〜1 */
  kana: (dsp: DspExports, r: Mono & { vowel: number; strength: number }) => mono(dsp, r, (input, n) => dsp.kana_vowel_demo(input, n, r.sampleRate, r.vowel, r.strength)),
  /** 区間に分けて並列に加工するときの区間の割り当て（試験的）。結果は [start, end, ctxStart, ctxEnd] を区間の数だけ並べたもの */
  segplan: (dsp: DspExports, r: { frames: number; sampleRate: number }) => {
    const n = dsp.segment_count(r.frames, r.sampleRate)
    const plan = new Float64Array(n * 4)
    for (let k = 0; k < n; k++) for (let f = 0; f < 4; f++) plan[k * 4 + f] = dsp.segment_bound(r.frames, r.sampleRate, k, f)
    // 区間の境界は Float64 で返す（Float32 では 5 分を超える位置が丸まる）
    return [new Float32Array(plan.buffer)]
  },
  /** 区間ごとに加工した音をつなぐ（試験的）。`channels` は区間の順、その中はチャンネルの順 */
  stitch: (dsp: DspExports, r: { channels: Float32Array[]; frames: number; channelCount: number; sampleRate: number; stretch: number }) =>
    withF32(dsp, concat(r.channels), (input) => readPlanar(dsp, dsp.stitch_planar(input, r.frames, r.channelCount, r.sampleRate, r.stretch), r.channelCount)),
}

type Ops = typeof OPS
/** Worker への頼みごと（kind が OPS の名前） */
export type DspRequest = { [K in keyof Ops]: { kind: K; id: number } & Parameters<Ops[K]>[1] }[keyof Ops]
/** `kind` の頼みごと */
export type DspRequestOf<K extends keyof Ops> = Extract<DspRequest, { kind: K }>
export type ProcessRequest = DspRequestOf<'process'>

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

scope.onmessage = async (e: MessageEvent<DspRequest>) => {
  const req = e.data
  try {
    const dsp = await ready
    currentId = req.id
    lastProgress = -1
    const channels = (OPS[req.kind] as (dsp: DspExports, r: DspRequest) => Float32Array[])(dsp, req)
    scope.postMessage({ id: req.id, channels } satisfies DspResponse, channels.map((c) => c.buffer))
  } catch (err) {
    const res: DspResponse = { id: req.id, error: String(err) }
    scope.postMessage(res)
  } finally {
    const dsp = await ready.catch(() => null)
    if (dsp) scope.postMessage({ id: -1, wasmBytes: dsp.memory.buffer.byteLength } satisfies DspResponse)
  }
}
