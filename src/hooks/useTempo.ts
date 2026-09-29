import { useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import { analyzeTempo, type TempoCandidate } from '../dsp/engine'

/**
 * テンポ（BPM）の自動解析。ファイルを開いた直後や、BPM 表示の「再解析」から呼ぶ。
 * 結果の候補は、BPM 表示のパネルで選び直せるように持っておく
 */
export function useTempo() {
  const [candidates, setCandidates] = useState<TempoCandidate[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  // 解析中に別のファイルを開いたら、古い結果は捨てる
  const latestRef = useRef<Clip | null>(null)

  /** `clip` を解析し、一番強い候補を `onDone` に渡す（候補が無ければ呼ばない） */
  const analyze = async (clip: Clip, onDone: (best: TempoCandidate) => void, onError: (e: unknown) => void) => {
    latestRef.current = clip
    setAnalyzing(true)
    try {
      const result = await analyzeTempo(clip.channels, clip.sampleRate)
      if (latestRef.current !== clip) return
      setCandidates(result)
      if (result[0]) onDone(result[0])
    } catch (e) {
      if (latestRef.current === clip) onError(e)
    } finally {
      if (latestRef.current === clip) setAnalyzing(false)
    }
  }

  /** 別のファイルを開いたときなど、前の候補を消す */
  const reset = () => {
    latestRef.current = null
    setCandidates([])
    setAnalyzing(false)
  }

  return { candidates, analyzing, analyze, reset }
}
