// 歌から一音（あ、い、う…）ずつ切り出す。文字化と読みは追加機能「歌詞の文字化」、境目は追加機能「解析」が行う（memo/kana-cut.md）
import type * as Analyzer from '../../analyzer/src/index'
import type * as Lyrics from '../../analyzer/src/lyrics'
import type { LyricsModel, LyricsSegment } from '../../analyzer/src/lyricsTypes'
import { createZip } from 'pevenmui/web'
import { encodeWav } from 'wevocal-lib'
import { loadAddon } from '../addons/addons'
import type { Clip } from './types'

export type { LyricsSegment } from '../../analyzer/src/lyricsTypes'

/** 一音（秒。音声の先頭から） */
export interface MoraMark {
  start: number
  end: number
  /** 読み（ひらがな） */
  mora: string
  /** 境目がはっきりしているか */
  sure: boolean
}

/** Whisper の区間の端はずれやすいので、前後をこれだけ広げて境目を探す（秒） */
const MARGIN_SEC = 0.3
/** 書き出すときの前後の余白（秒） */
const PAD_SEC = 0.02
/** 書き出すときの端のフェード（秒） */
const FADE_SEC = 0.005

/** `clip` の `start`〜`end` 秒 */
function slice(clip: Clip, start: number, end: number): Clip {
  const a = Math.max(0, Math.floor(start * clip.sampleRate))
  const b = Math.min(clip.channels[0]?.length ?? 0, Math.ceil(end * clip.sampleRate))
  return { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.slice(a, Math.max(a, b))) }
}

export interface TranscribeOptions {
  model: LyricsModel
  device: 'webgpu' | 'wasm'
  onDownload?: (p: number) => void
  onTranscribe?: () => void
  signal?: AbortSignal
}

/** `clip` の `start`〜`end` 秒を日本語として文字化し、読みを付ける。区間の時刻は音声の先頭から */
export async function transcribeRange(clip: Clip, start: number, end: number, o: TranscribeOptions): Promise<LyricsSegment[]> {
  const lyrics = await loadAddon<typeof Lyrics>('analyzer-lyrics')
  const segments = await lyrics.transcribeLyrics(slice(clip, start, end), { ...o, language: 'japanese' })
  return segments.map((s) => ({ ...s, start: s.start + start, end: s.end + start }))
}

/** 区間ごとの読みを一音ずつに分け、境目を求める。`onProgress` は 0〜1 */
export async function findMorae(clip: Clip, segments: LyricsSegment[], onProgress?: (p: number) => void, signal?: AbortSignal): Promise<MoraMark[]> {
  const analyzer = await loadAddon<typeof Analyzer>('analyzer')
  const out: MoraMark[] = []
  for (const [i, s] of segments.entries()) {
    signal?.throwIfAborted()
    const morae = analyzer.splitMora(s.reading ?? '')
    if (!morae.length) continue
    // 前の区間の終わりより前には広げない（同じ音を 2 回数えないため）
    const from = Math.max(0, s.start - MARGIN_SEC, out.length ? out[out.length - 1].end : 0)
    const to = s.end + MARGIN_SEC
    const found = await analyzer.segmentMorae(slice(clip, from, to), morae, { signal })
    for (const m of found) out.push({ start: m.start + from, end: m.end + from, mora: m.mora, sure: m.sure })
    onProgress?.((i + 1) / segments.length)
  }
  return out
}

/** 一音ずつの WAV をまとめた ZIP。同じ音が何度も出たら あ.wav、あ_2.wav… とする */
export async function exportMorae(clip: Clip, morae: MoraMark[]): Promise<Blob> {
  const count = new Map<string, number>()
  const entries = morae.map((m) => {
    const n = (count.get(m.mora) ?? 0) + 1
    count.set(m.mora, n)
    const c = slice(clip, m.start - PAD_SEC, m.end + PAD_SEC)
    const fade = Math.min(Math.round(FADE_SEC * clip.sampleRate), Math.floor((c.channels[0]?.length ?? 0) / 2))
    for (const ch of c.channels) {
      for (let i = 0; i < fade; i++) {
        const g = i / fade
        ch[i] *= g
        ch[ch.length - 1 - i] *= g
      }
    }
    return { name: n === 1 ? `${m.mora}.wav` : `${m.mora}_${n}.wav`, data: encodeWav(c) }
  })
  return createZip(entries)
}
