// 音声（Clip）の型と長さ、時間の表記の変換
import type { Clip } from 'wevocal-lib'

// 音声データと時間範囲の型は wevocal-lib（読み込み・書き出しと共通）
export type { Clip, Range } from 'wevocal-lib'

export const clipLength = (clip: Clip) => clip.channels[0]?.length ?? 0
export const clipDuration = (clip: Clip) => clipLength(clip) / clip.sampleRate

/** 時間の表記の変換（PevenMUI。WeVocal Studio と共通） */
export { formatTime, parseTime } from 'pevenmui'
