import type { DspRequest, DspResponse } from './worker'

/** Time-stretch method used by the DSP engine. */
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

/** Pitch-shift (semitones) and time-stretch (factor) planar audio in the DSP worker. */
export function processAudio(
  channels: Float32Array[],
  sampleRate: number,
  semitones: number,
  stretch: number,
  algorithm: Algorithm,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  const id = nextId++
  const req: DspRequest = { id, channels: channels.map((c) => c.slice()), sampleRate, semitones, stretch, algorithm: ALGORITHM_ID[algorithm] }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage(req, req.channels.map((c) => c.buffer))
  })
}
