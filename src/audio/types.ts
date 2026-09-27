/** Planar PCM audio held in memory. All channels have the same length. */
export interface Clip {
  sampleRate: number
  channels: Float32Array[]
}

/** A time range in seconds. */
export interface Range {
  start: number
  end: number
}

export const clipLength = (clip: Clip) => clip.channels[0]?.length ?? 0
export const clipDuration = (clip: Clip) => clipLength(clip) / clip.sampleRate
