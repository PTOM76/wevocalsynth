import type { Clip } from './types'

/** Read the sample rate from a RIFF/WAVE header, if the file is a WAV. */
function wavSampleRate(buf: ArrayBuffer): number | null {
  if (buf.byteLength < 12) return null
  const v = new DataView(buf)
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let o = 12
  while (o + 8 <= buf.byteLength) {
    const size = v.getUint32(o + 4, true)
    if (tag(o) === 'fmt ' && o + 16 <= buf.byteLength) return v.getUint32(o + 12, true)
    o += 8 + size + (size % 2)
  }
  return null
}

/**
 * Decode an audio file in the browser. For WAV the decoding context runs at
 * the file's own sample rate so nothing is resampled on import.
 */
export async function decodeFile(file: File): Promise<Clip> {
  const data = await file.arrayBuffer()
  const rate = Math.min(Math.max(wavSampleRate(data) ?? 48000, 8000), 384000)
  const ctx = new OfflineAudioContext(1, 1, rate)
  const audio = await ctx.decodeAudioData(data)
  return {
    sampleRate: audio.sampleRate,
    channels: Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice()),
  }
}
