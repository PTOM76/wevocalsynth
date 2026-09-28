import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip } from './types'
import { clipDuration } from './types'

/** メモリ上のクリップを Web Audio で再生する */
export function usePlayer(clip: Clip | null) {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const bufferRef = useRef<{ clip: Clip; buffer: AudioBuffer } | null>(null)
  // 再生中に AudioContext の時刻をクリップ上の時刻へ換算するための基準
  const clockRef = useRef({ ctxStart: 0, offset: 0, end: 0 })
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  const stopSource = useCallback(() => {
    const src = sourceRef.current
    if (src) {
      src.onended = null
      src.stop()
      src.disconnect()
      sourceRef.current = null
    }
  }, [])

  const currentTime = useCallback(() => {
    const ctx = ctxRef.current
    const c = clockRef.current
    if (!ctx || !sourceRef.current) return null
    return Math.min(c.end, c.offset + ctx.currentTime - c.ctxStart)
  }, [])

  const play = useCallback(
    async (from: number, to?: number) => {
      if (!clip) return
      const ctx = (ctxRef.current ??= new AudioContext())
      if (ctx.state === 'suspended') await ctx.resume()
      if (bufferRef.current?.clip !== clip) {
        const buffer = ctx.createBuffer(clip.channels.length, clip.channels[0].length, clip.sampleRate)
        clip.channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i))
        bufferRef.current = { clip, buffer }
      }
      stopSource()
      const duration = clipDuration(clip)
      const start = Math.max(0, Math.min(from, duration))
      const end = Math.max(start, Math.min(to ?? duration, duration))
      if (end - start < 1e-3) return
      const src = ctx.createBufferSource()
      src.buffer = bufferRef.current.buffer
      src.connect(ctx.destination)
      src.onended = () => {
        sourceRef.current = null
        setPlaying(false)
        // 範囲試聴の後は範囲の先頭に戻し、通常再生の後は終端で止める
        setPosition(to !== undefined ? start : end)
      }
      src.start(0, start, end - start)
      sourceRef.current = src
      clockRef.current = { ctxStart: ctx.currentTime, offset: start, end }
      setPosition(start)
      setPlaying(true)
    },
    [clip, stopSource],
  )

  const pause = useCallback(() => {
    const t = currentTime()
    stopSource()
    setPlaying(false)
    if (t !== null) setPosition(t)
  }, [currentTime, stopSource])

  const seek = useCallback(
    (t: number) => {
      if (sourceRef.current) void play(t)
      else setPosition(t)
    },
    [play],
  )

  // 再生中は position（React の状態）を更新しない。更新すると画面全体が描き直され、再生中に重くなるため。
  // 今の位置が要る部品（時間表示・再生位置の線・自動スクロール）は `livePosition` を自分で読む

  // クリップが切り替わったら再生を止め、再生位置を範囲内に収める
  useEffect(() => {
    stopSource()
    setPlaying(false)
    setPosition((p) => (clip ? Math.min(p, clipDuration(clip)) : 0))
  }, [clip, stopSource])

  useEffect(() => () => void ctxRef.current?.close(), [])

  /** 今の再生位置（再生中は毎回 AudioContext から求める。描画のループから呼ぶ） */
  const positionRef = useRef(position)
  positionRef.current = position
  const livePosition = useCallback(() => currentTime() ?? positionRef.current, [currentTime])

  return { playing, position, livePosition, play, pause, seek }
}
