// 書き出しの仕上げ（ノーマライズと両端のフェード）
import type { Clip } from './types'
import { clipDuration } from './types'
import { fadeRange, normalizeRange } from './edit'

/** 書き出すときの仕上げ（書き出し、フォルダーへの保存、外へのドラッグで共通。設定に覚える） */
export interface FinishOptions {
  /** 最大の音量を -1dB にそろえる */
  normalize: boolean
  /** 両端にかけるフェードの長さ（ミリ秒。0 ならかけない）。切り出した素材の端のプチッを防ぐ */
  fadeMs: number
}

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
