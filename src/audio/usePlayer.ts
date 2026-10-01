import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip } from './types'
import { clipDuration } from './types'

const NO_CLIPS: Clip[] = []

/**
 * メモリ上のクリップを Web Audio で再生する。`others`（ほかのトラックのうち鳴らすもの）も同じ位置から一緒に鳴らす。
 * 再生位置・長さ・終わりは `clip` が基準。`muted` なら `clip` は鳴らさない（ほかのトラックのミュート・ソロで消すとき）
 */
export function usePlayer(clip: Clip | null, others: Clip[] = NO_CLIPS, muted = false) {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  /** 一緒に鳴らしているほかのトラックの音 */
  const extraRef = useRef<AudioBufferSourceNode[]>([])
  /** クリップごとの AudioBuffer（作り直すと重いので覚えておく。クリップが捨てられたら一緒に消える） */
  const buffers = useRef(new WeakMap<Clip, AudioBuffer>())
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
    for (const e of extraRef.current) {
      e.stop()
      e.disconnect()
    }
    extraRef.current = []
  }, [])

  const currentTime = useCallback(() => {
    const ctx = ctxRef.current
    const c = clockRef.current
    if (!ctx || !sourceRef.current) return null
    // 開始は少し先の時刻にしているので、始まるまでは開始位置のままにする
    return Math.min(c.end, c.offset + Math.max(0, ctx.currentTime - c.ctxStart))
  }, [])

  const play = useCallback(
    async (from: number, to?: number) => {
      if (!clip) return
      const ctx = (ctxRef.current ??= new AudioContext())
      if (ctx.state === 'suspended') await ctx.resume()
      const bufferOf = (c: Clip) => {
        let b = buffers.current.get(c)
        if (!b) {
          b = ctx.createBuffer(c.channels.length, c.channels[0].length, c.sampleRate)
          for (const [i, ch] of c.channels.entries()) b.copyToChannel(ch as Float32Array<ArrayBuffer>, i)
          buffers.current.set(c, b)
        }
        return b
      }
      stopSource()
      const duration = clipDuration(clip)
      const start = Math.max(0, Math.min(from, duration))
      const end = Math.max(start, Math.min(to ?? duration, duration))
      if (end - start < 1e-3) return
      const src = ctx.createBufferSource()
      src.buffer = bufferOf(clip)
      // 鳴らさないときも、再生位置と終わりの基準にするため音源は作る（音量 0 でつなぐ）
      if (muted) {
        const g = ctx.createGain()
        g.gain.value = 0
        src.connect(g).connect(ctx.destination)
      } else src.connect(ctx.destination)
      src.onended = () => {
        sourceRef.current = null
        setPlaying(false)
        // 範囲試聴の後は範囲の先頭に戻し、通常再生の後は終端で止める
        setPosition(to !== undefined ? start : end)
      }
      // 開始の時刻をそろえるため、少し先の同じ時刻に始める
      const at = ctx.currentTime + 0.02
      src.start(at, start, end - start)
      sourceRef.current = src
      extraRef.current = others
        .filter((o) => clipDuration(o) > start)
        .map((o) => {
          const e = ctx.createBufferSource()
          e.buffer = bufferOf(o)
          e.connect(ctx.destination)
          e.start(at, start, Math.min(end, clipDuration(o)) - start)
          return e
        })
      clockRef.current = { ctxStart: at, offset: start, end }
      setPosition(start)
      setPlaying(true)
    },
    [clip, others, muted, stopSource],
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
