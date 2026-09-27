import type { Clip, Range } from './types'
import { applyEdit, removeRange, sliceClip } from './edit'
import type { ProcessOptions } from '../dsp/engine'

/** 範囲を開始位置順に並べ、重なる・接する範囲をまとめる */
export function normalizeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** 複数のクリップを順につなげる */
export function concatClips(clips: Clip[]): Clip {
  const len = clips.reduce((n, c) => n + c.channels[0].length, 0)
  const first = clips[0]
  return {
    sampleRate: first.sampleRate,
    channels: first.channels.map((_, ci) => {
      const out = new Float32Array(len)
      let o = 0
      for (const c of clips) {
        out.set(c.channels[ci], o)
        o += c.channels[ci].length
      }
      return out
    }),
  }
}

/**
 * 各範囲に同じピッチ変更・時間伸縮を適用する。長さが変わっても前の範囲の位置がずれないよう、
 * 後ろの範囲から順に処理する。新しいクリップと、加工後の各範囲（開始位置順）を返す。
 */
export async function applyEditToRanges(
  clip: Clip,
  ranges: Range[],
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<{ clip: Clip; ranges: Range[] }> {
  const sorted = normalizeRanges(ranges)
  let cur = clip
  // 処理済み（自分より後ろ）の範囲。前の範囲の長さが変わるたびに後ろへずらす
  const done: Range[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const step = sorted.length - 1 - i
    const r = sorted[i]
    const result = await applyEdit(cur, r, opts, (p) => onProgress?.((step + p) / sorted.length))
    const delta = result.range.end - r.end
    for (const d of done) {
      d.start += delta
      d.end += delta
    }
    done.unshift(result.range)
    cur = result.clip
  }
  return { clip: cur, ranges: done }
}

/** 各範囲に長さを変えない処理（音量編集など）を順に適用する */
export function mapRanges(clip: Clip, ranges: Range[], fn: (clip: Clip, r: Range) => Clip): Clip {
  return normalizeRanges(ranges).reduce(fn, clip)
}

/** 全範囲を削除する（後ろから削除して位置がずれないようにする） */
export function removeRanges(clip: Clip, ranges: Range[]): Clip {
  return normalizeRanges(ranges)
    .reverse()
    .reduce((c, r) => removeRange(c, r), clip)
}

/** 全範囲を開始位置順につなげて切り出す */
export function sliceRanges(clip: Clip, ranges: Range[]): Clip {
  return concatClips(normalizeRanges(ranges).map((r) => sliceClip(clip, r)))
}
