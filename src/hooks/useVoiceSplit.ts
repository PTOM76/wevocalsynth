import type { Clip } from '../audio/types'
import type { Track } from '../audio/tracks'
import { splitVoices } from '../dsp/engine'
import { t } from '../i18n/i18n'

interface Deps {
  tracks: Track[]
  activeId: string
  /** トラック `id` を別々のトラックに置き換える */
  split: (parts: { name: string; clip: Clip }[], label: string, id: string) => void
  run: (label: string, task: (signal: AbortSignal) => Promise<void>) => Promise<void>
  setProgress: (p: number) => void
  notify: (message: string) => void
}

/** 和音を 2 つの声に分ける（試作。設定の開発者向けで表示する。memo の設計と dsp/src/voices.rs） */
export function useVoiceSplit(d: Deps) {
  /** トラック全体を、高さ（または音量）で 2 つのトラックに分ける */
  return async (by: 'pitch' | 'volume', id = d.activeId) => {
    const track = d.tracks.find((tr) => tr.id === id)
    if (!track) return
    const clip = track.clip
    await d.run(t('task.splitVoices'), async (signal) => {
      const r = await splitVoices(clip.channels, clip.sampleRate, by, d.setProgress)
      if (signal.aborted) return
      const [a, b] = by === 'pitch' ? ['track.voiceHigh', 'track.voiceLow'] as const : ['track.voiceLoud', 'track.voiceQuiet'] as const
      d.split(
        [
          { name: t(a, { name: track.name }), clip: { sampleRate: clip.sampleRate, channels: r.a } },
          { name: t(b, { name: track.name }), clip: { sampleRate: clip.sampleRate, channels: r.b } },
        ],
        t('voices.split'),
        id,
      )
      d.notify(t('toast.voicesSplit'))
    })
  }
}
