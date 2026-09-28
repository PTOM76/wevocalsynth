import { useEffect, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { applyPitchCurve } from '../audio/edit'
import { shiftPitch } from '../audio/pitchTools'
import { usePlayer } from '../audio/usePlayer'
import { F0_HOP_SEC, type ProcessOptions } from '../dsp/engine'
import type { usePitchTarget } from './usePitchTarget'
import { clipBytes, reportMemory } from '../debug/debugStats'

/** 試聴で、曲線の前後に含める長さ（秒）。つながりも聴けるようにする */
const PREVIEW_MARGIN_SEC = 0.3

type CurveFn = (cur: Float32Array | null, f0: Float32Array, k0: number, k1: number) => Float32Array

interface Deps {
  /** 表示中のクリップと、加工の対象（加工後のクリップ）。表示が原音のときは加工できない */
  shown: Clip | null
  edited: Clip | null
  pitch: Float32Array | null
  pitchTarget: ReturnType<typeof usePitchTarget>
  selections: Range[]
  opts: Pick<ProcessOptions, 'algorithm' | 'preserveFormant' | 'formantSemitones'>
  setShowPitch: (show: boolean) => void
  /** 試聴を始める前に、ほかの再生を止める */
  stopOthers: () => void
}

/**
 * ピッチ曲線の加工（まとめて作る・上下する）と、適用前の試聴。
 * 対象は選択範囲（複数なら全部、なければ全体）
 */
export function usePitchTools(d: Deps) {
  const { shown, edited, pitch, pitchTarget } = d
  const ready = !!pitch && !!edited && shown === edited

  /** 対象のフレーム範囲ごとに `fn` で曲線を作り、ピッチ帯に出す */
  const edit = (fn: CurveFn) => {
    if (!shown) return
    if (!pitch) {
      // まだ解析していなければピッチ表示を点けて解析を始める
      d.setShowPitch(true)
      return
    }
    const ranges = d.selections.length ? d.selections : [{ start: 0, end: clipDuration(shown) }]
    let cur = pitchTarget.target?.clip === shown ? pitchTarget.target.hz : null
    for (const r of ranges) cur = fn(cur, pitch, Math.floor(r.start / F0_HOP_SEC), Math.ceil(r.end / F0_HOP_SEC))
    if (cur) pitchTarget.replace(shown, cur)
    d.setShowPitch(true)
  }

  /** まとめて `semitones` 半音上下する */
  const shift = (semitones: number) => edit((cur, f0, k0, k1) => shiftPitch(cur, f0, k0, k1, semitones))

  // 試聴: 曲線のある部分だけを加工したクリップを作り、その前後を含めて再生する
  const [preview, setPreview] = useState<{ clip: Clip; range: Range } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const player = usePlayer(preview?.clip ?? null)
  // デバッグ表示: 試聴用に作ったクリップの量
  useEffect(() => reportMemory('curvePreview', clipBytes(preview?.clip)), [preview])
  // 曲線を変えたり破棄したりしたら、古い試聴は使わない
  useEffect(() => setPreview(null), [pitchTarget.target])

  // 作ったクリップが usePlayer に渡ってから再生する
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!pending || !preview) return
    setPending(false)
    void player.play(preview.range.start, preview.range.end)
  }, [pending, preview, player])

  const togglePreview = async () => {
    if (player.playing) return player.pause()
    const target = pitchTarget.target
    if (!ready || !edited || !pitch || target?.clip !== edited) return
    d.stopOthers()
    if (preview) return void player.play(preview.range.start, preview.range.end)
    let first = -1
    let last = -1
    target.hz.forEach((v, k) => {
      if (v > 0) {
        if (first < 0) first = k
        last = k
      }
    })
    if (first < 0) return
    setPreviewBusy(true)
    try {
      const clip = await applyPitchCurve(edited, pitch, target.hz, d.opts)
      if (!clip) return
      const range = {
        start: Math.max(0, first * F0_HOP_SEC - PREVIEW_MARGIN_SEC),
        end: Math.min(clipDuration(clip), (last + 1) * F0_HOP_SEC + PREVIEW_MARGIN_SEC),
      }
      setPreview({ clip, range })
      setPending(true)
    } finally {
      setPreviewBusy(false)
    }
  }

  return { ready, edit, shift, preview: { playing: player.playing, busy: previewBusy, toggle: togglePreview, pause: player.pause } }
}
