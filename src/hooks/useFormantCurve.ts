import { useEffect, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { applyFormantCurve } from '../audio/edit'
import { usePlayer } from '../audio/usePlayer'
import { CURVE_HOP_SEC, useLaneCurve } from './useLaneCurve'
import { clipBytes, reportMemory } from '../debug/debugStats'

/** 試聴で、曲線の前後に含める長さ（秒）。つながりも聴けるようにする */
const PREVIEW_MARGIN_SEC = 0.3

/**
 * フォルマントの帯に描いた曲線（半音）と、適用前の試聴。
 * 音量と違って再生中にすぐ反映できない（処理が要る）ため、ピッチ曲線と同じく試聴ボタンで加工して聴く
 */
export function useFormantCurve(edited: Clip | null, stopOthers: () => void) {
  const curve = useLaneCurve()
  const [preview, setPreview] = useState<{ clip: Clip; range: Range } | null>(null)
  const [busy, setBusy] = useState(false)
  const player = usePlayer(preview?.clip ?? null)
  // デバッグ表示: 試聴用に作ったクリップの量
  useEffect(() => reportMemory('formantPreview', clipBytes(preview?.clip)), [preview])
  // 曲線を変えたり破棄したりしたら、古い試聴は使わない
  useEffect(() => setPreview(null), [curve.curve])

  // 作ったクリップが usePlayer に渡ってから再生する
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!pending || !preview) return
    setPending(false)
    void player.play(preview.range.start, preview.range.end)
  }, [pending, preview, player])

  const toggle = async () => {
    if (player.playing) return player.pause()
    const c = curve.curve
    if (!edited || c?.clip !== edited) return
    stopOthers()
    if (preview) return void player.play(preview.range.start, preview.range.end)
    setBusy(true)
    try {
      const r = await applyFormantCurve(edited, c.values, CURVE_HOP_SEC)
      if (!r) return
      const range = {
        start: Math.max(0, r.range.start - PREVIEW_MARGIN_SEC),
        end: Math.min(clipDuration(r.clip), r.range.end + PREVIEW_MARGIN_SEC),
      }
      setPreview({ clip: r.clip, range })
      setPending(true)
    } finally {
      setBusy(false)
    }
  }

  return { ...curve, preview: { playing: player.playing, busy, toggle, pause: player.pause } }
}
