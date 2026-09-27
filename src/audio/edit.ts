import type { Clip, Range } from './types'
import { processAudio, type Algorithm } from '../dsp/engine'

/** Crossfade length where processed audio meets the untouched parts. */
const FADE_SEC = 0.005

/**
 * Apply pitch shift / time stretch to `range` of `clip` and splice the result
 * back in. Returns the new clip and the range the processed audio now occupies.
 */
export async function applyEdit(
  clip: Clip,
  range: Range,
  semitones: number,
  stretch: number,
  algorithm: Algorithm,
  onProgress?: (p: number) => void,
): Promise<{ clip: Clip; range: Range }> {
  const sr = clip.sampleRate
  const len = clip.channels[0].length
  const s = Math.max(0, Math.min(len, Math.round(range.start * sr)))
  const e = Math.max(s, Math.min(len, Math.round(range.end * sr)))
  const processed = await processAudio(
    clip.channels.map((c) => c.subarray(s, e)),
    sr,
    semitones,
    stretch,
    algorithm,
    onProgress,
  )
  const pLen = processed[0].length
  const fade = Math.min(Math.round(FADE_SEC * sr), Math.floor(pLen / 2), s, len - e)

  const channels = clip.channels.map((src, ci) => {
    const p = processed[ci]
    const out = new Float32Array(s + pLen + (len - e))
    out.set(src.subarray(0, s), 0)
    out.set(p, s)
    out.set(src.subarray(e), s + pLen)
    // Short linear crossfades at both seams to avoid clicks.
    for (let i = 0; i < fade; i++) {
      const g = i / fade
      out[s + i] = p[i] * g + src[s + i] * (1 - g)
      const k = pLen - fade + i
      out[s + k] = p[k] * (1 - g) + src[e - fade + i] * g
    }
    return out
  })
  return { clip: { sampleRate: sr, channels }, range: { start: s / sr, end: (s + pLen) / sr } }
}

/** Copy `range` of `clip` into a new clip. */
export function sliceClip(clip: Clip, range: Range): Clip {
  const [s, e] = toFrames(clip, range)
  return { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.slice(s, e)) }
}

/** Remove `range` from `clip`, crossfading the seam. */
export function removeRange(clip: Clip, range: Range): Clip {
  const [s, e] = toFrames(clip, range)
  return join(sliceClip(clip, { start: 0, end: s / clip.sampleRate }), sliceClip(clip, { start: e / clip.sampleRate, end: Infinity }))
}

/** Insert `part` into `clip` at time `at` (seconds). Sample rates must match. */
export function insertAt(clip: Clip, part: Clip, at: number): Clip {
  const head = sliceClip(clip, { start: 0, end: at })
  const tail = sliceClip(clip, { start: at, end: Infinity })
  return join(join(head, part), tail)
}

function toFrames(clip: Clip, range: Range): [number, number] {
  const len = clip.channels[0].length
  const s = Math.max(0, Math.min(len, Math.round(range.start * clip.sampleRate)))
  const e = Math.max(s, Math.min(len, Math.round(range.end * clip.sampleRate)))
  return [s, e]
}

/** Concatenate two clips with short fades at the seam to avoid clicks. */
function join(a: Clip, b: Clip): Clip {
  const fade = Math.round(FADE_SEC * a.sampleRate)
  return {
    sampleRate: a.sampleRate,
    channels: a.channels.map((ca, ci) => {
      const cb = b.channels[Math.min(ci, b.channels.length - 1)]
      const out = new Float32Array(ca.length + cb.length)
      out.set(ca, 0)
      out.set(cb, ca.length)
      if (ca.length && cb.length) {
        const fa = Math.min(fade, ca.length)
        const fb = Math.min(fade, cb.length)
        for (let i = 0; i < fa; i++) out[ca.length - fa + i] *= 1 - i / fa
        for (let i = 0; i < fb; i++) out[ca.length + i] *= i / fb
      }
      return out
    }),
  }
}
