import { hzToMidi } from './notes'

/** 音符ブロックの区切り: 無声で途切れるか、1 半音以上跳ぶところ */
const isBreak = (at: (k: number) => number, k: number) =>
  !(at(k) > 0) || !(at(k - 1) > 0) || Math.abs(hzToMidi(at(k)) - hzToMidi(at(k - 1))) >= 1

/** フレーム k0〜e-1 の音の高さ（平均に一番近い半音） */
const noteOf = (at: (k: number) => number, k0: number, e: number) => {
  let sum = 0
  for (let j = k0; j < e; j++) sum += hzToMidi(at(j))
  return Math.round(sum / (e - k0))
}

/** フレーム k0〜k1 にかかる音符ブロック（`at(k)` は Hz、0 は無声） */
export function noteBlocks(at: (k: number) => number, k0: number, k1: number): { k0: number; k1: number; note: number }[] {
  const out: { k0: number; k1: number; note: number }[] = []
  for (let k = k0; k <= k1; ) {
    if (!(at(k) > 0)) {
      k++
      continue
    }
    let e = k + 1
    while (e <= k1 && !isBreak(at, e)) e++
    out.push({ k0: k, k1: e - 1, note: noteOf(at, k, e) })
    k = e
  }
  return out
}

/** フレーム k を含む音符ブロック（無声なら null）。`len` はフレーム数 */
export function noteBlockAt(at: (k: number) => number, k: number, len: number) {
  if (!(at(k) > 0)) return null
  let k0 = k
  let k1 = k
  while (k0 > 0 && !isBreak(at, k0)) k0--
  while (k1 + 1 < len && !isBreak(at, k1 + 1)) k1++
  return { k0, k1, note: noteOf(at, k0, k1 + 1) }
}
