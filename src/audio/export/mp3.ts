import type { Clip } from '../types'
import { toInt16 } from './prepare'

/** 1回に渡すサンプル数（MP3 のフレーム 1152 の倍数） */
const CHUNK = 1152 * 20

/**
 * MP3 にエンコードする。エンコーダ（lamejs、LGPL-3.0）は MP3 を書き出すときだけ
 * 動的 import で読み込む。別ファイルに分かれるので、初回表示を重くせず、差し替えもできる。
 * 長い音声でも画面が固まらないよう、区切りごとに処理を譲る。
 */
export async function encodeMp3(clip: Clip, kbps: number, onProgress?: (p: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const channels = clip.channels.slice(0, 2)
  const encoder = new Mp3Encoder(channels.length, clip.sampleRate, kbps)
  const pcm = channels.map(toInt16)
  const parts: BlobPart[] = []
  const len = pcm[0].length
  for (let i = 0; i < len; i += CHUNK) {
    const chunk = pcm.map((c) => c.subarray(i, i + CHUNK))
    const out = encoder.encodeBuffer(chunk[0], chunk[1])
    if (out.length) parts.push(out.slice())
    onProgress?.(i / len)
    await new Promise((r) => setTimeout(r, 0))
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(tail.slice())
  onProgress?.(1)
  return new Blob(parts, { type: 'audio/mpeg' })
}
