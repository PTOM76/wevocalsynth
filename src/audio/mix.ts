// トラックを足し合わせて 1 つにする（統合と書き出し）
import type { Clip } from './types'
import { clipDuration } from './types'

/**
 * `clips` を足し合わせて1つのクリップにする（トラックの統合）。
 * 結果は `sampleRate` Hz・`channels` チャンネルで、長さは一番長いクリップに合わせる。
 * サンプルレートやチャンネル数が違っても、ブラウザ（OfflineAudioContext）が変換して混ぜる
 */
export async function mixClips(clips: Clip[], sampleRate: number, channels: number): Promise<Clip> {
  const dur = Math.max(...clips.map(clipDuration))
  const ctx = new OfflineAudioContext(channels, Math.max(1, Math.round(dur * sampleRate)), sampleRate)
  for (const c of clips) {
    const buf = ctx.createBuffer(c.channels.length, c.channels[0].length, c.sampleRate)
    for (const [i, ch] of c.channels.entries()) buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
  }
  const out = await ctx.startRendering()
  return { sampleRate, channels: Array.from({ length: channels }, (_, i) => out.getChannelData(i)) }
}
