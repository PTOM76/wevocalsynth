import type { Clip } from 'wevocal-lib'

// 音声データと時間範囲の型は wevocal-lib（読み込み・書き出しと共通）
export type { Clip, Range } from 'wevocal-lib'

export const clipLength = (clip: Clip) => clip.channels[0]?.length ?? 0
export const clipDuration = (clip: Clip) => clipLength(clip) / clip.sampleRate

/** 秒を「分:秒.ミリ秒」で表す */
export function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
