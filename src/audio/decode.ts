import type { Clip } from './types'

/** WAV ファイルなら RIFF/WAVE ヘッダからサンプルレートを読み取る */
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
 * MP4 / M4A なら、音声トラックの `mp4a` サンプルエントリからサンプルレートを読み取る。
 * 先頭から箱（サイズ＋種類）をたどって `moov` を見つけ、その中だけで `mp4a` を探す。
 * ファイル全体を1バイトずつ走査すると、動画のような大きなファイルでメインスレッドが止まるため
 */
export function mp4SampleRate(buf: ArrayBuffer): number | null {
  const b = new Uint8Array(buf)
  const v = new DataView(buf)
  const type = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
  // ftyp（先頭の箱）がなければ MP4 ではない
  if (b.length < 12 || type(4) !== 'ftyp') return null
  let o = 0
  while (o + 8 <= b.length) {
    let size = v.getUint32(o)
    let header = 8
    if (size === 1 && o + 16 <= b.length) {
      // 64bit のサイズ（大きな mdat など）
      size = Number(v.getBigUint64(o + 8))
      header = 16
    } else if (size === 0) {
      size = b.length - o // ファイルの最後まで
    }
    if (size < header) return null
    if (type(o + 4) === 'moov') return findMp4aRate(v, b, o + header, Math.min(b.length, o + size))
    o += size
  }
  return null
}

/** moov の範囲 [from, to) から `mp4a` サンプルエントリを探してサンプルレートを返す */
function findMp4aRate(v: DataView, b: Uint8Array, from: number, to: number): number | null {
  for (let i = from; i + 28 < to; i++) {
    if (b[i] !== 0x6d || b[i + 1] !== 0x70 || b[i + 2] !== 0x34 || b[i + 3] !== 0x61) continue // "mp4a"
    // mp4a の型名の後ろ: 予約6 + データ参照2 + 予約8 + チャンネル数2 + サンプルサイズ2 + 予約4 + サンプルレート（16.16 固定小数点）
    const rate = v.getUint32(i + 4 + 24) >>> 16
    if (rate >= 8000 && rate <= 384000) return rate
  }
  return null
}

/** 読み込める拡張子・形式（ファイル選択ダイアログ用）。MP4 は音声トラックだけを使う */
export const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.mp4,video/mp4'

/**
 * 音声ファイルをブラウザ内でデコードする。WAV と MP4 はファイル自身の
 * サンプルレートでデコードし、読み込み時のリサンプルを避ける。
 */
export async function decodeFile(file: File): Promise<Clip> {
  const data = await file.arrayBuffer()
  const rate = Math.min(Math.max(wavSampleRate(data) ?? mp4SampleRate(data) ?? 48000, 8000), 384000)
  const ctx = new OfflineAudioContext(1, 1, rate)
  const audio = await ctx.decodeAudioData(data)
  return {
    sampleRate: audio.sampleRate,
    channels: Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice()),
  }
}
