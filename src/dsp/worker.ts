// Runs the wasm DSP engine off the main thread.
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
  ): number
  output_ptr(): number
}

export interface DspRequest {
  id: number
  channels: Float32Array[]
  sampleRate: number
  semitones: number
  stretch: number
  /** 0 = WSOLA, 1 = phase vocoder (matches `Algorithm::from_id`). */
  algorithm: number
}

export type DspResponse =
  | { id: number; channels: Float32Array[] }
  | { id: number; error: string }
  | { id: number; progress: number }

// The worker global shares Worker's message API; avoids pulling in the webworker lib.
const scope = self as unknown as Worker

// Request being processed, used to tag progress messages from wasm.
let currentId = 0
let lastProgress = -1

function reportProgress(p: number) {
  // Throttle to whole percents.
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

function run(dsp: DspExports, req: DspRequest): Float32Array[] {
  const frames = req.channels[0]?.length ?? 0
  const count = req.channels.length
  const total = frames * count
  const input = dsp.alloc_f32(total)
  try {
    const view = new Float32Array(dsp.memory.buffer, input, total)
    req.channels.forEach((c, i) => view.set(c, i * frames))
    const outFrames = dsp.process_planar(input, frames, count, req.sampleRate, req.semitones, req.stretch, req.algorithm)
    // Memory may have grown during processing, so create the view afterwards.
    const out = new Float32Array(dsp.memory.buffer, dsp.output_ptr(), outFrames * count)
    return Array.from({ length: count }, (_, i) => out.slice(i * outFrames, (i + 1) * outFrames))
  } finally {
    dsp.free_f32(input, total)
  }
}

scope.onmessage = async (e: MessageEvent<DspRequest>) => {
  const req = e.data
  try {
    const dsp = await ready
    currentId = req.id
    lastProgress = -1
    const channels = run(dsp, req)
    const res: DspResponse = { id: req.id, channels }
    scope.postMessage(res, channels.map((c) => c.buffer))
  } catch (err) {
    const res: DspResponse = { id: req.id, error: String(err) }
    scope.postMessage(res)
  }
}
