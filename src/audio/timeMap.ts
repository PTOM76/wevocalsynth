// 編集の前の時刻を、編集の後の時刻に写す（読みの帯などの位置を、音声の編集に追従させる）
import type { MoraMark } from './kanaCut'
import type { Range } from './types'

/** 並べて重なりをまとめる（multiRange の normalizeRanges と同じ。音声処理を読み込まずに使えるよう、ここにも置く） */
function normalize(ranges: Range[]): Range[] {
  const out: Range[] = []
  for (const r of ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** 編集の前の時刻（秒）→ 後の時刻。消えた所は、消した範囲の始まりに寄せる */
export type TimeMap = (t: number) => number

/** `ranges` を取り除いたとき */
export function removeMap(ranges: Range[]): TimeMap {
  const rs = normalize(ranges)
  return (t) => {
    let shift = 0
    for (const r of rs) {
      if (t <= r.start) break
      shift += Math.min(t, r.end) - r.start
    }
    return t - shift
  }
}

/** `at` に `sec` 秒を差し込んだとき（`at` より後ろがずれる） */
export const insertMap = (at: number, sec: number): TimeMap => (t) => (t >= at ? t + sec : t)

/** `ranges` だけを残してつないだとき（トリミング）。範囲の外は、近い端に寄せる */
export function keepMap(ranges: Range[]): TimeMap {
  const rs = normalize(ranges)
  return (t) => {
    let acc = 0
    for (const r of rs) {
      if (t < r.start) return acc
      if (t <= r.end) return acc + t - r.start
      acc += r.end - r.start
    }
    return acc
  }
}

/** 区間 `start`〜`end` をそれぞれ `dur` 秒にしたとき（区間の外は、前の区間の伸び縮みだけずれる） */
export function stretchMap(parts: { start: number; end: number; dur: number }[]): TimeMap {
  const ps = parts.filter((p) => p.end > p.start).sort((a, b) => a.start - b.start)
  return (t) => {
    let shift = 0
    for (const p of ps) {
      if (t <= p.start) break
      if (t < p.end) return p.start + shift + ((t - p.start) / (p.end - p.start)) * p.dur
      shift += p.dur - (p.end - p.start)
    }
    return t + shift
  }
}

/** 一音の最短（秒）。写したあとこれより短くなったもの（消した範囲に入ったもの）は捨てる */
const MIN_SEC = 0.01

/** 一音ずつの範囲を `map` で写す */
export function mapMorae(morae: MoraMark[], map: TimeMap): MoraMark[] {
  return morae.map((m) => ({ ...m, start: map(m.start), end: map(m.end) })).filter((m) => m.end - m.start >= MIN_SEC)
}

/** 写し方が分からない編集の既定: 長さが同じならそのまま、違えば全体を同じ比で伸び縮みさせる（全体の伸縮） */
export const scaleMap = (fromSec: number, toSec: number): TimeMap => (fromSec > 0 && Math.abs(fromSec - toSec) > 1e-6 ? (t) => (t * toSec) / fromSec : (t) => t)
