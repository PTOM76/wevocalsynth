// 和音を 2 つの声に分ける操作（試作）
import type { Clip, Range } from '../audio/types'
import type { Track } from '../audio/tracks'
import { spliceProcessed } from '../audio/edit'
import { normalizeRanges } from '../audio/multiRange'
import { splitVoices } from '../dsp/engine'
import { t } from '../i18n/i18n'

interface Deps {
  tracks: Track[]
  activeId: string
  /** 選択範囲（なければトラック全体） */
  selections: Range[]
  /** トラック `id` を別々のトラックに置き換える */
  split: (parts: { name: string; clip: Clip }[], label: string, id: string) => void
  run: (label: string, task: (signal: AbortSignal) => Promise<void>) => Promise<void>
  setProgress: (p: number) => void
  notify: (message: string) => void
}

/**
 * 和音を 2 つの声に分ける（試験的機能。設定の開発者向けで表示する。dsp/src/voices/）。
 * 選択範囲があれば、その範囲だけを分ける。A のトラックは範囲の外を元のまま残し、B のトラックは範囲の外を無音にする（足すと元の音になる）
 */
export function useVoiceSplit(d: Deps) {
  return async (by: 'pitch' | 'volume', id = d.activeId) => {
    const track = d.tracks.find((tr) => tr.id === id)
    if (!track) return
    const clip = track.clip
    const sr = clip.sampleRate
    const len = clip.channels[0]?.length ?? 0
    // 選んでいるトラックの選択範囲だけを使う（ほかのトラックのメニューからは全体）
    const ranges = id === d.activeId && d.selections.length ? normalizeRanges(d.selections) : [{ start: 0, end: len / sr }]
    await d.run(t('task.splitVoices'), async (signal) => {
      let a: Clip = clip
      let b: Clip = { sampleRate: sr, channels: clip.channels.map(() => new Float32Array(len)) }
      for (const [i, r] of ranges.entries()) {
        const s = Math.max(0, Math.min(len, Math.round(r.start * sr)))
        const e = Math.max(s, Math.min(len, Math.round(r.end * sr)))
        if (e - s < 1) continue
        const part = await splitVoices(clip.channels.map((c) => c.subarray(s, e)), sr, by, (p) => d.setProgress((i + p) / ranges.length))
        if (signal.aborted) return
        a = spliceProcessed(a, { s, e, channels: part.a }).clip
        b = spliceProcessed(b, { s, e, channels: part.b }).clip
      }
      const [na, nb] = by === 'pitch' ? ['track.voiceHigh', 'track.voiceLow'] as const : ['track.voiceLoud', 'track.voiceQuiet'] as const
      d.split([{ name: t(na, { name: track.name }), clip: a }, { name: t(nb, { name: track.name }), clip: b }], t('voices.split'), id)
      d.notify(t('toast.voicesSplit'))
    })
  }
}
