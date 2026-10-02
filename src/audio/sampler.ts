import type { Clip } from './types'
import { processAudio } from '../dsp/engine'

/** 音符の長さへの合わせ方（stretch: 伸縮 / loop: 繰り返す / cut: そのまま、長ければ切る） */
export type FitMode = 'stretch' | 'loop' | 'cut'

export interface SamplerNote {
  note: number
  start: number
  end: number
}

type ProcessOptions = Parameters<typeof processAudio>[2]

/** 音の頭と終わりのフェード（秒）。継ぎ目のプチッという音を防ぐ */
const FADE_SEC = 0.005

/**
 * 素材 `sample` を、各音符の位置へその高さ・長さで置いたクリップを作る。
 * 高さは `baseNote`（素材の音程）との差だけピッチを変える。処理方式などは `opts` のもの
 */
export async function placeOnNotes(
  sample: Clip,
  notes: SamplerNote[],
  baseNote: number,
  fit: FitMode,
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<Clip> {
  const sr = sample.sampleRate
  const list = notes.filter((n) => n.end > n.start)
  const total = Math.ceil(Math.max(0, ...list.map((n) => n.end)) * sr)
  const out = sample.channels.map(() => new Float32Array(total))
  const sampleSec = sample.channels[0].length / sr
  // 同じ高さ（伸縮なら長さも）の加工結果は使い回す
  const cache = new Map<string, Float32Array[]>()
  const process = (semitones: number, stretch: number, i: number) =>
    processAudio(sample.channels, sr, { ...opts, semitones, stretch }, (p) => onProgress?.((i + p) / list.length))

  for (const [i, n] of list.entries()) {
    const semitones = n.note - baseNote
    const dur = n.end - n.start
    const stretch = fit === 'stretch' ? dur / sampleSec : 1
    const key = `${semitones}:${stretch.toFixed(3)}`
    const src = cache.get(key) ?? (await process(semitones, stretch, i))
    cache.set(key, src)
    const at = Math.round(n.start * sr)
    const len = Math.min(Math.round(dur * sr), total - at)
    const fade = Math.max(1, Math.round(FADE_SEC * sr))
    out.forEach((ch, c) => {
      const s = src[Math.min(c, src.length - 1)]
      const end = fit === 'cut' ? Math.min(len, s.length) : len
      for (let k = 0; k < end; k++) {
        // 繰り返すときは、つなぎ目ごとにフェードする
        const pos = fit === 'loop' ? k % s.length : k
        if (pos >= s.length) break
        const head = fit === 'loop' ? pos : k
        const tail = Math.min(end - k, fit === 'loop' ? s.length - pos : end - k)
        const g = Math.min(1, head / fade, tail / fade)
        ch[at + k] += s[pos] * g
      }
    })
    onProgress?.((i + 1) / list.length)
  }
  return { sampleRate: sr, channels: out }
}
