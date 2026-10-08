// 選択範囲の音程を解析する
import { useEffect, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { analyzeF0 } from '../dsp/engine'
import { hzToMidi, median } from '../audio/notes'

/** 範囲選択が落ち着いてから解析するまでの待ち時間（ミリ秒） */
const DELAY_MS = 250
/** 解析する範囲の上限（秒）。長い範囲は代表的な音程が意味を持ちにくいので解析しない */
const MAX_SEC = 30

/**
 * 範囲の代表的な音程（有声フレームの F0 の中央値、MIDI ノート番号）。
 * 解析中は undefined、無声・長すぎる範囲は null。
 */
export function useRangeNote(clip: Clip | null, range: Range | null): number | null | undefined {
  const [result, setResult] = useState<{ clip: Clip; key: string; midi: number | null } | null>(null)
  const key = clip && range ? `${range.start}:${range.end}` : ''

  const start = range?.start
  const end = range?.end
  useEffect(() => {
    if (!clip || start === undefined || end === undefined) return
    if (end - start > MAX_SEC) {
      setResult({ clip, key: `${start}:${end}`, midi: null })
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      const s = Math.floor(start * clip.sampleRate)
      const e = Math.floor(end * clip.sampleRate)
      analyzeF0(
        clip.channels.map((c) => c.subarray(s, e)),
        clip.sampleRate,
      )
        .then((f0) => {
          const voiced = Array.from(f0).filter((v) => v > 0)
          const m = median(voiced)
          if (!cancelled) setResult({ clip, key: `${start}:${end}`, midi: m === null ? null : hzToMidi(m) })
        })
        .catch(() => !cancelled && setResult({ clip, key: `${start}:${end}`, midi: null }))
    }, DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [clip, start, end])

  if (!key) return null
  return result?.clip === clip && result.key === key ? result.midi : undefined
}
