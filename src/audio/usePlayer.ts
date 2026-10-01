import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from './types'
import { clipDuration } from './types'

/** 一緒に鳴らすトラック（id はレベルメーターの対応づけに使う） */
export interface PlayTrack {
  id: string
  clip: Clip
}

const NO_TRACKS: PlayTrack[] = []

/** レベルメーター用の AnalyserNode を作る（時間波形を読むだけなので小さくてよい） */
function makeAnalyser(ctx: AudioContext) {
  const a = ctx.createAnalyser()
  a.fftSize = 1024
  return a
}

/** 適用前の音量・パン（スライダーの値）を、再生中の音に反映するための指定。`ranges` の中だけ `db` 変え、`pan`（-1〜1）に振る */
export interface LiveGain {
  ranges: Range[]
  db: number
  pan: number
}

/** 範囲の境目で音量を切り替える時間（秒）。適用時のランプ（edit.ts の GAIN_RAMP_SEC）と同じ */
const RAMP_SEC = 0.005

/**
 * メモリ上のクリップを Web Audio で再生する。`others`（ほかのトラックのうち鳴らすもの）も同じ位置から一緒に鳴らす。
 * 再生位置・長さ・終わりは `clip` が基準。`muted` なら `clip` は鳴らさない（ほかのトラックのミュート・ソロで消すとき）。
 * `liveGain` は適用前の音量で、再生中に変えてもすぐ反映する（`clip` の音だけに効く）。
 * `id` は `clip` のトラックの id。トラックごとと全体のレベルメーター用に、`analyser(id)` / `masterAnalysers()`（左・右）を返す
 */
export function usePlayer(
  clip: Clip | null,
  opts: { id?: string; others?: PlayTrack[]; muted?: boolean; liveGain?: LiveGain | null } = {},
) {
  const { id = 'main', others = NO_TRACKS, muted = false, liveGain = null } = opts
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  /** 一緒に鳴らしているほかのトラックの音 */
  const extraRef = useRef<AudioBufferSourceNode[]>([])
  /** `clip` の音の音量（適用前の音量をここで反映する） */
  const gainRef = useRef<GainNode | null>(null)
  const panRef = useRef<StereoPannerNode | null>(null)
  const liveGainRef = useRef(liveGain)
  liveGainRef.current = liveGain
  /** レベルメーター: トラックごと（再生のたびに作る）と、全体の出口 */
  const analysersRef = useRef(new Map<string, AnalyserNode>())
  const masterRef = useRef<AnalyserNode | null>(null)
  /** 全体の左右（ステレオのメーター用） */
  const masterLRRef = useRef<[AnalyserNode, AnalyserNode] | null>(null)
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
    analysersRef.current.clear()
  }, [])

  const currentTime = useCallback(() => {
    const ctx = ctxRef.current
    const c = clockRef.current
    if (!ctx || !sourceRef.current) return null
    // 開始は少し先の時刻にしているので、始まるまでは開始位置のままにする
    return Math.min(c.end, c.offset + Math.max(0, ctx.currentTime - c.ctxStart))
  }, [])

  /**
   * 適用前の音量を、これから鳴る部分に予約する。範囲に入る・出る時刻で音量を切り替える。
   * 再生中にスライダーを動かしたら呼び直し、今の時刻から先を入れ直す
   */
  const scheduleGain = useCallback(() => {
    const ctx = ctxRef.current
    const gain = gainRef.current?.gain
    const pan = panRef.current?.pan
    if (!ctx || !gain || !pan || !sourceRef.current) return
    const { ctxStart, offset, end } = clockRef.current
    const lg = liveGainRef.current
    const now = ctx.currentTime
    const pos = offset + Math.max(0, now - ctxStart)
    const inside = (t: number) => !!lg && lg.ranges.some((r) => t >= r.start && t < r.end)
    // 音量とパンを同じ形で予約する（範囲の中は inValue、外は outValue）
    const schedule = (param: AudioParam, inValue: number, outValue: number) => {
      param.cancelScheduledValues(now)
      param.setValueAtTime(inside(pos) ? inValue : outValue, now)
      if (!lg) return
      for (const r of lg.ranges) {
        for (const [t, from, to] of [[r.start, outValue, inValue], [r.end, inValue, outValue]] as const) {
          if (t <= pos || t >= end) continue
          const when = ctxStart + (t - offset)
          param.setValueAtTime(from, Math.max(now, when - RAMP_SEC))
          param.linearRampToValueAtTime(to, when)
        }
      }
    }
    schedule(gain, lg ? 10 ** (lg.db / 20) : 1, 1)
    schedule(pan, lg ? lg.pan : 0, 0)
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
      const gain = ctx.createGain()
      gainRef.current = gain
      if (muted) gain.gain.value = 0
      // 全体の出口（レベルメーター）。AudioContext ごとに1つ
      if (!masterRef.current || masterRef.current.context !== ctx) {
        masterRef.current = makeAnalyser(ctx)
        masterRef.current.connect(ctx.destination)
        // 左右に分けて別々に測る（AnalyserNode はチャンネルを混ぜて読むため）
        const split = ctx.createChannelSplitter(2)
        masterRef.current.connect(split)
        const l = makeAnalyser(ctx)
        const r = makeAnalyser(ctx)
        split.connect(l, 0)
        split.connect(r, 1)
        masterLRRef.current = [l, r]
      }
      const master = masterRef.current
      const meter = makeAnalyser(ctx)
      analysersRef.current.set(id, meter)
      // パン: モノラルも左右同じ音のステレオにしてから掛ける（適用の panRange と同じ計算になるように）
      const panner = ctx.createStereoPanner()
      panner.channelCount = 2
      panner.channelCountMode = 'explicit'
      panner.channelInterpretation = 'speakers'
      panRef.current = panner
      src.connect(gain).connect(panner).connect(meter).connect(master)
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
        .filter((o) => clipDuration(o.clip) > start)
        .map((o) => {
          const e = ctx.createBufferSource()
          e.buffer = bufferOf(o.clip)
          const m = makeAnalyser(ctx)
          analysersRef.current.set(o.id, m)
          e.connect(m).connect(master)
          e.start(at, start, Math.min(end, clipDuration(o.clip)) - start)
          return e
        })
      clockRef.current = { ctxStart: at, offset: start, end }
      if (!muted) scheduleGain()
      setPosition(start)
      setPlaying(true)
    },
    [clip, id, others, muted, stopSource, scheduleGain],
  )

  // 再生中に適用前の音量が変わったら、すぐ反映する
  const gainKey = liveGain ? `${liveGain.db}:${liveGain.pan}:${liveGain.ranges.map((r) => `${r.start}-${r.end}`).join(',')}` : ''
  useEffect(() => {
    if (!muted) scheduleGain()
  }, [gainKey, muted, scheduleGain])

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

  /** トラック `id` のレベルメーター（再生していなければ null） */
  const analyser = useCallback((trackId: string) => analysersRef.current.get(trackId) ?? null, [])
  /** 全体のレベルメーター（左・右。再生していなければ null） */
  const masterAnalysers = useCallback(() => (sourceRef.current ? masterLRRef.current : null), [])

  return { playing, position, livePosition, play, pause, seek, analyser, masterAnalysers }
}
