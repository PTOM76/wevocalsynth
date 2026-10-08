// 通常の再生と試聴の切り替え（片方を始めたらもう片方を止める）
import type { Range } from '../audio/types'

/** usePlayer の戻り値のうち、ここで使う部分 */
interface Player {
  playing: boolean
  position: number
  play: (from: number, to?: number) => Promise<void>
  pause: () => void
  seek: (t: number) => void
}

interface Loop {
  playing: boolean
  start: () => Promise<void>
  stop: () => void
}

/**
 * 通常再生・試聴（加工済みプレビュー）・ループ（リアルタイム試聴）の切り替え。
 * どれか1つを始めたら、ほかは止める。
 */
/** `curve` はピッチ曲線の試聴。ここからは止めるだけ（始めるのは usePitchTools） */
export function usePlayback(main: Player, preview: Player, loop: Loop, curve: { pause: () => void }, duration: number, selection: Range | null) {
  const stopAll = () => {
    main.pause()
    preview.pause()
    loop.stop()
    curve.pause()
  }
  const only = (keep: 'main' | 'preview' | 'loop') => {
    if (keep !== 'main') main.pause()
    if (keep !== 'preview') preview.pause()
    if (keep !== 'loop') loop.stop()
    curve.pause()
  }

  return {
    stopAll,
    togglePlay: () => {
      only('main')
      if (main.playing) main.pause()
      else void main.play(main.position >= duration - 1e-3 ? 0 : main.position)
    },
    /** `t` から再生する */
    playFrom: (t: number) => {
      only('main')
      void main.play(t)
    },
    stop: () => {
      main.pause()
      main.seek(0)
    },
    playSelection: () => {
      if (!selection) return
      only('main')
      void main.play(selection.start, selection.end)
    },
    togglePreview: () => {
      if (preview.playing) return preview.pause()
      only('preview')
      void preview.play(0)
    },
    toggleLoop: () => {
      if (loop.playing) return loop.stop()
      only('loop')
      void loop.start()
    },
  }
}
