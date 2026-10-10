// 書き出しの仕上げ（ノーマライズと両端のフェード）
import type { Clip } from './types'
import { clipDuration } from './types'
import { fadeRange, normalizeRange } from './edit'

/** 書き出すときの仕上げ（型は wevocal-lib。書き出しのダイアログと共通） */
export type { FinishOptions } from 'wevocal-lib/react'
import type { FinishOptions } from 'wevocal-lib/react'

/** `c` に仕上げをかける。フェードは長さの半分までにし、そのあとでノーマライズする（フェードで下がった分は数えない） */
export function finishClip(c: Clip, o: FinishOptions): Clip {
  const dur = clipDuration(c)
  if (!(dur > 0)) return c
  let out = c
  if (o.fadeMs > 0) {
    const f = Math.min(o.fadeMs / 1000, dur / 2)
    out = fadeRange(out, { start: 0, end: f }, 'in')
    out = fadeRange(out, { start: dur - f, end: dur }, 'out')
  }
  if (o.normalize) out = normalizeRange(out, { start: 0, end: dur }) ?? out
  return out
}
