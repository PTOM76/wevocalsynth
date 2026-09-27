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

  // 再生中は再生位置を追従する
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const t = currentTime()
      if (t !== null) setPosition(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, currentTime])

  // クリップが切り替わったら再生を止め、再生位置を範囲内に収める
  useEffect(() => {
    stopSource()
    setPlaying(false)
    setPosition((p) => (clip ? Math.min(p, clipDuration(clip)) : 0))
  }, [clip, stopSource])

  useEffect(() => () => void ctxRef.current?.close(), [])

  return { playing, position, play, pause, seek }
}
