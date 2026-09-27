import type { Clip, Range } from './types'
import { F0_HOP_SEC, processAudio, processCurve, type ProcessOptions } from '../dsp/engine'

/** 加工部分と未加工部分の継ぎ目のクロスフェード長 */
const FADE_SEC = 0.005

/**
 * `clip` の `range` にピッチ変更・時間伸縮を適用して元の位置に差し戻す。
 * 新しいクリップと、加工後の音声が占める範囲を返す。
 */
export async function applyEdit(
  clip: Clip,
  range: Range,
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<{ clip: Clip; range: Range }> {
  const sr = clip.sampleRate
  const len = clip.channels[0].length
  const s = Math.max(0, Math.min(len, Math.round(range.start * sr)))
  const e = Math.max(s, Math.min(len, Math.round(range.end * sr)))
  const processed = await processAudio(
    clip.channels.map((c) => c.subarray(s, e)),
    sr,
    opts,
    onProgress,
  )
  return splice(clip, s, e, processed)
}

/**
 * `clip` のサンプル区間 [s, e) を `processed` に置き換える。
 * 新しいクリップと、置き換えた音声が占める範囲を返す。
 */
function splice(clip: Clip, s: number, e: number, processed: Float32Array[]): { clip: Clip; range: Range } {
  const sr = clip.sampleRate
  const len = clip.channels[0].length
  const pLen = processed[0].length
  const fade = Math.min(Math.round(FADE_SEC * sr), Math.floor(pLen / 2), s, len - e)

  const channels = clip.channels.map((src, ci) => {
    const p = processed[ci]
    const out = new Float32Array(s + pLen + (len - e))
    out.set(src.subarray(0, s), 0)
    out.set(p, s)
    out.set(src.subarray(e), s + pLen)
    // クリックノイズを避けるため、両端の継ぎ目を短く線形クロスフェードする
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

/** ピッチカーブ編集で、編集した区間の前後に含める余白（F0 フレーム数） */
const CURVE_MARGIN_FRAMES = 10
/** ピッチ比の急な段差をならす移動平均の幅（F0 フレーム数、奇数） */
const CURVE_SMOOTH_FRAMES = 5

/**
 * ピッチカーブ編集を適用する。`f0` は `clip` の F0、`target` は描いた目標ピッチ
 * （どちらも Hz、`F0_HOP_SEC` 間隔、0 は未編集または無声）。編集した区間とその前後だけを処理する。
 * 編集がなければ null を返す。
 */
export async function applyPitchCurve(
  clip: Clip,
  f0: Float32Array,
  target: Float32Array,
  opts: Pick<ProcessOptions, 'algorithm' | 'preserveFormant' | 'formantSemitones'>,
  onProgress?: (p: number) => void,
): Promise<Clip | null> {
  const n = Math.min(f0.length, target.length)
  const raw = new Float32Array(n).fill(1)
  let first = -1
  let last = -1
  for (let k = 0; k < n; k++) {
    if (target[k] > 0 && f0[k] > 0) {
      raw[k] = target[k] / f0[k]
      if (first < 0) first = k
      last = k
    }
  }
  if (first < 0) return null

  // 段差をならす（描き始め・描き終わりで急に跳ばないように）
  const half = (CURVE_SMOOTH_FRAMES - 1) / 2
  const k0 = Math.max(0, first - CURVE_MARGIN_FRAMES)
  const k1 = Math.min(n - 1, last + CURVE_MARGIN_FRAMES)
  const ratios = new Float32Array(k1 - k0 + 1)
  for (let k = k0; k <= k1; k++) {
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, k - half); j <= Math.min(n - 1, k + half); j++) {
      sum += raw[j]
      cnt++
    }
    ratios[k - k0] = sum / cnt
  }

  const sr = clip.sampleRate
  const len = clip.channels[0].length
  const s = Math.min(len, Math.round(k0 * F0_HOP_SEC * sr))
  const e = Math.min(len, Math.round((k1 + 1) * F0_HOP_SEC * sr))
  const processed = await processCurve(
    clip.channels.map((c) => c.subarray(s, e)),
    sr,
    ratios,
    opts,
    onProgress,
  )
  return splice(clip, s, e, processed).clip
}

/** `clip` の `range` を新しいクリップとして切り出す */
export function sliceClip(clip: Clip, range: Range): Clip {
  const [s, e] = toFrames(clip, range)
  return { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.slice(s, e)) }
}

/** `clip` から `range` を削除し、継ぎ目をフェードでつなぐ */
export function removeRange(clip: Clip, range: Range): Clip {
  const [s, e] = toFrames(clip, range)
  return join(sliceClip(clip, { start: 0, end: s / clip.sampleRate }), sliceClip(clip, { start: e / clip.sampleRate, end: Infinity }))
}

/** `clip` の時刻 `at`（秒）に `part` を挿入する。サンプルレートは一致している前提 */
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

/** 2つのクリップを連結する。クリックノイズ防止のため継ぎ目に短いフェードを入れる */
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
