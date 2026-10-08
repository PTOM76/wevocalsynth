// 音声の編集の計算（範囲への加工、切り取りと挿入、音量、フェード、反転、曲線の書き込み）
import type { Clip, Range } from './types'
import { F0_HOP_SEC, processAudio, processCurve, processFormantCurve, type ProcessOptions } from '../dsp/engine'

/**
 * 継ぎ目（加工部分と未加工部分の差し戻し・貼り付け・切り取り）のクロスフェード長（秒）。
 * 低い音では 5ms だと短くてプチッと鳴ることがあるので、設定（開発者向け）で聴き比べられるようにしている
 */
let FADE_SEC = 0.005

/** 継ぎ目のクロスフェード長を変える（設定から呼ぶ） */
export function setSpliceFadeSec(sec: number) {
  FADE_SEC = sec
}

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
  const r = await processRange(clip, range, opts, onProgress)
  return spliceProcessed(clip, r)
}

/** `clip` の `range` を加工した結果。差し戻す位置（サンプル区間 [s, e)）も持つ */
export interface ProcessedRange {
  s: number
  e: number
  channels: Float32Array[]
}

/** `clip` の `range` を加工する（差し戻しはしない）。プレビューにも使う */
export async function processRange(
  clip: Clip,
  range: Range,
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<ProcessedRange> {
  const [s, e] = toFrames(clip, range)
  const channels = await processAudio(
    clip.channels.map((c) => c.subarray(s, e)),
    clip.sampleRate,
    opts,
    onProgress,
  )
  return { s, e, channels }
}

/** `processRange` の結果を元の位置に差し戻す。新しいクリップと、加工後の音声が占める範囲を返す */
export function spliceProcessed(clip: Clip, r: ProcessedRange): { clip: Clip; range: Range } {
  return splice(clip, r.s, r.e, r.channels)
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
  // 全体を加工したなら、つなぐものが無いので加工後の音声をそのまま使う（全体の長さの配列をもう1つ作らない）
  if (s === 0 && e === len) return { clip: { sampleRate: sr, channels: processed }, range: { start: 0, end: pLen / sr } }

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

/**
 * フォルマントカーブ編集を適用する。`shifts` は描いたずらし量（半音、`hopSec` 間隔、0 は元のまま）。
 * ずらした区間とその前後だけを処理する。新しいクリップと、ずらした区間（試聴の範囲に使う）を返す。編集がなければ null
 */
export async function applyFormantCurve(
  clip: Clip,
  shifts: Float32Array,
  hopSec: number,
  onProgress?: (p: number) => void,
): Promise<{ clip: Clip; range: Range } | null> {
  let first = -1
  let last = -1
  shifts.forEach((v, k) => {
    if (v !== 0) {
      if (first < 0) first = k
      last = k
    }
  })
  if (first < 0) return null
  const k0 = Math.max(0, first - CURVE_MARGIN_FRAMES)
  const k1 = Math.min(shifts.length - 1, last + CURVE_MARGIN_FRAMES)
  const sr = clip.sampleRate
  const len = clip.channels[0].length
  const s = Math.min(len, Math.round(k0 * hopSec * sr))
  const e = Math.min(len, Math.round((k1 + 1) * hopSec * sr))
  if (e <= s) return null
  const processed = await processFormantCurve(
    clip.channels.map((c) => c.subarray(s, e)),
    sr,
    shifts.subarray(k0, k1 + 1),
    hopSec,
    onProgress,
  )
  return { clip: splice(clip, s, e, processed).clip, range: { start: first * hopSec, end: (last + 1) * hopSec } }
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

/** 音量操作の境界で急な段差が出ないよう、ゲインをなめらかに切り替える時間 */
const GAIN_RAMP_SEC = 0.005

/**
 * `range` 内の各サンプルに `gainAt(u)` を掛けた新しいクリップを返す。
 * u は範囲内の位置（0〜1）。範囲の両端は短いランプで元の音量につなぐ。
 */
function mapGain(clip: Clip, range: Range, gainAt: (u: number) => number): Clip {
  const [s, e] = toFrames(clip, range)
  const n = e - s
  const ramp = Math.min(Math.round(GAIN_RAMP_SEC * clip.sampleRate), Math.floor(n / 2))
  return {
    sampleRate: clip.sampleRate,
    channels: clip.channels.map((src) => {
      const out = src.slice()
      for (let i = 0; i < n; i++) {
        let g = gainAt(n > 1 ? i / (n - 1) : 0)
        // 端では 1（元の音量）から目的のゲインへ移る
        const edge = Math.min(i, n - 1 - i)
        if (edge < ramp) g = 1 + (g - 1) * (edge / ramp)
        out[s + i] = src[s + i] * g
      }
      return out
    }),
  }
}

/** `range` の音量を `db` デシベル変える */
export function gainRange(clip: Clip, range: Range, db: number): Clip {
  const g = 10 ** (db / 20)
  return mapGain(clip, range, () => g)
}

/** `range` をフェードイン（'in'）またはフェードアウト（'out'）する。カーブは聴感上なめらかな sin² */
export function fadeRange(clip: Clip, range: Range, dir: 'in' | 'out'): Clip {
  const [s, e] = toFrames(clip, range)
  const n = e - s
  return {
    sampleRate: clip.sampleRate,
    channels: clip.channels.map((src) => {
      const out = src.slice()
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : 1
        const g = Math.sin((Math.PI / 2) * (dir === 'in' ? u : 1 - u)) ** 2
        out[s + i] = src[s + i] * g
      }
      return out
    }),
  }
}

/** `range` のピークが `peakDb` デシベルになるよう音量を揃える。無音なら null */
export function normalizeRange(clip: Clip, range: Range, peakDb = -1): Clip | null {
  const [s, e] = toFrames(clip, range)
  let peak = 0
  for (const c of clip.channels) for (let i = s; i < e; i++) peak = Math.max(peak, Math.abs(c[i]))
  if (peak < 1e-6) return null
  return gainRange(clip, range, peakDb - 20 * Math.log10(peak))
}

/**
 * `range` のパン（-1 = 左 … 0 = 中央 … 1 = 右）を変える。計算は Web Audio の StereoPannerNode（ステレオ入力）と同じ式で、
 * 再生中の試聴（usePlayer）と結果が一致する。モノラルは左右同じ音のステレオにしてから掛ける（パン 0 の部分は音量が変わらない）。
 * 範囲の両端は GAIN_RAMP_SEC かけてパンを切り替える
 */
export function panRange(clip: Clip, range: Range, pan: number): Clip {
  const [s, e] = toFrames(clip, range)
  const n = e - s
  const ramp = Math.min(Math.round(GAIN_RAMP_SEC * clip.sampleRate), Math.floor(n / 2))
  const [l0, r0] = clip.channels.length >= 2 ? clip.channels : [clip.channels[0], clip.channels[0]]
  const l = l0.slice()
  const r = r0.slice()
  for (let i = 0; i < n; i++) {
    const edge = Math.min(i, n - 1 - i)
    const p = edge < ramp ? pan * (edge / ramp) : pan
    const a = l0[s + i]
    const b = r0[s + i]
    // StereoPannerNode（ステレオ入力）: 左に振るときは右の音を左へ寄せ、右に振るときは左の音を右へ寄せる
    if (p <= 0) {
      const x = ((p + 1) * Math.PI) / 2
      l[s + i] = a + b * Math.cos(x)
      r[s + i] = b * Math.sin(x)
    } else {
      const x = (p * Math.PI) / 2
      l[s + i] = a * Math.cos(x)
      r[s + i] = b + a * Math.sin(x)
    }
  }
  return { sampleRate: clip.sampleRate, channels: [l, r, ...clip.channels.slice(2)] }
}

/**
 * トラックのフェーダー（音量 `db`・パン `pan`）を、クリップ全体に掛けた音声（書き出し用）。
 * 再生（usePlayer の GainNode → StereoPannerNode）と同じ計算。どちらも中立なら元のクリップを返す
 */
export function applyFader(clip: Clip, db: number, pan: number, invert = false): Clip {
  if (db === 0 && pan === 0 && !invert) return clip
  // 位相の反転は負の倍率（再生の usePlayer と同じ）
  const g = 10 ** (db / 20) * (invert ? -1 : 1)
  if (pan === 0) return { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.map((v) => v * g)) }
  const [l0, r0] = clip.channels.length >= 2 ? clip.channels : [clip.channels[0], clip.channels[0]]
  const n = l0.length
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  const x = ((pan <= 0 ? pan + 1 : pan) * Math.PI) / 2
  const [cos, sin] = [Math.cos(x), Math.sin(x)]
  for (let i = 0; i < n; i++) {
    const a = l0[i] * g
    const b = r0[i] * g
    // StereoPannerNode（ステレオ入力）と同じ式（panRange の説明を参照）
    if (pan <= 0) {
      l[i] = a + b * cos
      r[i] = b * sin
    } else {
      l[i] = a * cos
      r[i] = b + a * sin
    }
  }
  return { sampleRate: clip.sampleRate, channels: [l, r] }
}

/**
 * 音量の曲線（dB、`hopSec` 間隔、0 は元の音量）を音声に掛ける。フレームの間は dB を線形補間する。
 * 再生中の試聴（usePlayer の setValueCurveAtTime）と同じ値になる
 */
export function applyGainCurve(clip: Clip, db: Float32Array, hopSec: number): Clip {
  const sr = clip.sampleRate
  const n = clip.channels[0].length
  const gain = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const f = i / sr / hopSec
    const k = Math.min(db.length - 1, Math.floor(f))
    const k2 = Math.min(db.length - 1, k + 1)
    const d = db[k] + (db[k2] - db[k]) * (f - k)
    gain[i] = 10 ** (d / 20)
  }
  return { sampleRate: sr, channels: clip.channels.map((c) => c.map((v, i) => v * gain[i])) }
}

/** `range` を無音にする */
export function silenceRange(clip: Clip, range: Range): Clip {
  return mapGain(clip, range, () => 0)
}

/** `range` の音を前後逆に並べる（逆再生）。長さは変わらない */
export function reverseRange(clip: Clip, range: Range): Clip {
  const [s, e] = toFrames(clip, range)
  return {
    sampleRate: clip.sampleRate,
    channels: clip.channels.map((c) => {
      const out = c.slice()
      out.subarray(s, e).reverse()
      return out
    }),
  }
}
