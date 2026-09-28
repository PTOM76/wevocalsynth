import { F0_HOP_SEC } from '../dsp/engine'
import { hzToMidi, midiToHz } from './notes'

/** ビブラートの設定 */
export interface VibratoOptions {
  /** 深さ（半音、片側の振れ幅） */
  depth: number
  /** 速さ（Hz、1秒あたりの揺れの回数） */
  rate: number
  /** かかり始めの遅れ（秒）。伸ばした音の頭はまっすぐで、途中から揺れ始める歌い方に合わせる */
  delay: number
}

/** 遅れの後、深さがなめらかに立ち上がるまでの時間（秒） */
const ATTACK_SEC = 0.2
/** 範囲の終わりで弱めていく時間（秒）。継ぎ目で音程が跳ばないようにする */
const RELEASE_SEC = 0.05
/** 「平らにする」でならす幅（秒）。ビブラート1周期（5〜6Hz）より長く取る */
const FLATTEN_SEC = 0.25

/** 0〜1 をなめらかにつなぐ（端で傾きが 0 になる） */
const smooth = (u: number) => {
  const x = Math.min(1, Math.max(0, u))
  return x * x * (3 - 2 * x)
}

/**
 * フレーム k0〜k1 のピッチにビブラートを重ねた目標ピッチを返す（Hz、F0 と同じフレーム、0 は未編集）。
 * `base` は元にするピッチ（描いた線があればそれ、なければ解析した F0）。無声のフレームには付けない
 */
export function addVibrato(target: Float32Array | null, f0: Float32Array, k0: number, k1: number, o: VibratoOptions): Float32Array {
  const out = target ? target.slice() : new Float32Array(f0.length)
  const len = (k1 - k0) * F0_HOP_SEC
  for (let k = Math.max(0, k0); k <= Math.min(f0.length - 1, k1); k++) {
    if (!(f0[k] > 0)) continue
    const base = out[k] > 0 ? out[k] : f0[k]
    const t = (k - k0) * F0_HOP_SEC
    const env = smooth((t - o.delay) / ATTACK_SEC) * smooth((len - t) / RELEASE_SEC)
    const m = hzToMidi(base) + o.depth * env * Math.sin(2 * Math.PI * o.rate * Math.max(0, t - o.delay))
    out[k] = midiToHz(m)
  }
  return out
}

/**
 * フレーム k0〜k1 のピッチをならして、元の揺れ（ビブラート）を取り除いた目標ピッチを返す。
 * 有声のフレームだけで移動平均を取る（無声の 0 を平均に混ぜると音程が下がるため）
 */
export function flattenPitch(target: Float32Array | null, f0: Float32Array, k0: number, k1: number): Float32Array {
  const out = target ? target.slice() : new Float32Array(f0.length)
  const src = (k: number) => (out[k] > 0 ? out[k] : f0[k])
  const half = Math.round(FLATTEN_SEC / F0_HOP_SEC / 2)
  const smoothed: number[] = []
  for (let k = Math.max(0, k0); k <= Math.min(f0.length - 1, k1); k++) {
    if (!(f0[k] > 0)) {
      smoothed.push(0)
      continue
    }
    let sum = 0
    let n = 0
    for (let j = Math.max(k0, k - half); j <= Math.min(k1, f0.length - 1, k + half); j++) {
      if (f0[j] > 0) {
        sum += hzToMidi(src(j))
        n++
      }
    }
    smoothed.push(midiToHz(sum / n))
  }
  smoothed.forEach((hz, i) => {
    if (hz > 0) out[Math.max(0, k0) + i] = hz
  })
  return out
}
