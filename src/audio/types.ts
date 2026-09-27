/** メモリ上のプレーナー形式 PCM 音声。全チャンネルは同じ長さ */
export interface Clip {
  sampleRate: number
  channels: Float32Array[]
}

/** 時間範囲（秒） */
export interface Range {
  start: number
  end: number
}

export const clipLength = (clip: Clip) => clip.channels[0]?.length ?? 0
export const clipDuration = (clip: Clip) => clipLength(clip) / clip.sampleRate

/** 秒を「分:秒.ミリ秒」で表す */
export function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
