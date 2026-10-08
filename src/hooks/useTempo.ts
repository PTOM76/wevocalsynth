import { useRef, useState } from 'react'
import type { Clip } from '../audio/types'
import { analyzeTempo, isCancelled, type TempoCandidate } from '../dsp/engine'
import { detectTempoChanges, type TempoChangeSection } from '../audio/tempoChange'
import { startJob } from '../progress/jobs'
import { t } from '../i18n/i18n'
import { useAppSettings } from '../settings/settings'

/**
 * テンポ（BPM）の自動解析。ファイルを開いた直後や、BPM 表示の「再解析」から呼ぶ。
 * 結果の候補は、BPM 表示のパネルで選び直せるように持っておく。解析中は、進んでいる処理の一覧（ゲージ）にも出す。
 * 設定によっては、途中でテンポが変わるかも調べ、変わっていたら `changes` に入れる（ダイアログで採用するか尋ねる）
 */
export function useTempo() {
  const { settings } = useAppSettings()
  const [candidates, setCandidates] = useState<TempoCandidate[]>([])
  const [changes, setChanges] = useState<TempoChangeSection[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  // 解析中に別のファイルを開いたら、古い結果は捨てる
  const latestRef = useRef<Clip | null>(null)
  const jobRef = useRef<ReturnType<typeof startJob> | null>(null)

  /** `clip` を解析し、一番強い候補を `onDone` に渡す（候補が無ければ呼ばない） */
  const analyze = async (clip: Clip, onDone: (best: TempoCandidate) => void, onError: (e: unknown) => void) => {
    latestRef.current = clip
    setAnalyzing(true)
    jobRef.current?.end()
    const job = startJob('analyze', t('job.tempo'))
    job.update(-1)
    jobRef.current = job
    try {
      const result = await analyzeTempo(clip.channels, clip.sampleRate)
      if (latestRef.current !== clip) return
      setCandidates(result)
      if (!result[0]) return
      onDone(result[0])
      const found = await detectTempoChanges(clip, result[0], settings.tempoChange)
      if (latestRef.current === clip) setChanges(found)
    } catch (e) {
      if (latestRef.current === clip && !isCancelled(e)) onError(e)
    } finally {
      job.end()
      if (latestRef.current === clip) setAnalyzing(false)
    }
  }

  /** 別のファイルを開いたときなど、前の候補を消す */
  const reset = () => {
    latestRef.current = null
    jobRef.current?.end()
    setCandidates([])
    setChanges(null)
    setAnalyzing(false)
  }

  /** 見つけたテンポの変化を、採用したか見送ったあとに消す */
  const clearChanges = () => setChanges(null)

  return { candidates, analyzing, analyze, reset, changes, clearChanges }
}
