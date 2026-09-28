import { useEffect, useMemo, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { processRange, type ProcessedRange } from '../audio/edit'
import { usePlayer } from '../audio/usePlayer'
import type { EditParams } from '../components/EditPanel'
import { clipBytes, reportMemory } from '../debug/debugStats'

/** 自動プレビューする範囲の上限（秒） */
const PREVIEW_MAX_SEC = 20
/** パラメータ変更からプレビュー処理を始めるまでの待ち時間（ミリ秒） */
const PREVIEW_DELAY_MS = 300

/** パラメータが無変更（加工しても元のまま）か */
export const isNeutral = (p: EditParams) =>
  p.semitones === 0 && p.stretch === 1 && !(p.preserveFormant && p.formantSemitones !== 0)

const sameParams = (a: EditParams, b: EditParams) =>
  a.semitones === b.semitones &&
  a.stretch === b.stretch &&
  a.algorithm === b.algorithm &&
  a.preserveFormant === b.preserveFormant &&
  a.formantSemitones === b.formantSemitones

/** 加工済みプレビュー。どのクリップ・範囲・パラメータで作ったかを持ち、一致するときだけ使う */
interface Preview {
  clip: Clip
  range: Range
  params: EditParams
  result: ProcessedRange
}

export type PreviewState = 'none' | 'busy' | 'ready' | 'tooLong' | 'multi'

/**
 * パラメータを変えたら加工範囲を裏で処理しておき、すぐ試聴できるようにする。
 * `enabled` が false の間（処理中・原音表示中など）や、`range` が null（複数範囲など）のときは処理しない。
 */
export function usePreview(clip: Clip | null, range: Range | null, params: EditParams, enabled: boolean) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const tooLong = !!range && range.end - range.start > PREVIEW_MAX_SEC
  const matches =
    !!preview &&
    !!range &&
    preview.clip === clip &&
    preview.range.start === range.start &&
    preview.range.end === range.end &&
    sameParams(preview.params, params)

  const previewClip = useMemo<Clip | null>(
    () => (matches && preview ? { sampleRate: preview.clip.sampleRate, channels: preview.result.channels } : null),
    [matches, preview],
  )
  const player = usePlayer(previewClip)
  // デバッグ表示: 試聴用に加工した音声の量
  useEffect(() => reportMemory('preview', clipBytes(preview?.result)), [preview])

  const start = range?.start
  const end = range?.end
  useEffect(() => {
    if (!enabled || !clip || start === undefined || end === undefined) return
    if (isNeutral(params) || tooLong || matches) return
    let cancelled = false
    const r = { start, end }
    const timer = setTimeout(() => {
      setBusy(true)
      processRange(clip, r, params)
        .then((result) => !cancelled && setPreview({ clip, range: r, params, result }))
        .catch(() => {})
        .finally(() => !cancelled && setBusy(false))
    }, PREVIEW_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      setBusy(false)
    }
  }, [enabled, clip, start, end, params, tooLong, matches])

  const state: PreviewState = tooLong ? 'tooLong' : previewClip ? 'ready' : busy ? 'busy' : 'none'
  return {
    state,
    player,
    /** 現在の設定と一致するプレビュー結果（なければ null） */
    result: matches && preview ? preview.result : null,
  }
}
