import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from './types'
import { DEFAULT_FADER, faderGain, type TrackFader } from './tracks'
import { clipDuration } from './types'

/** 一緒に鳴らすトラック（id はレベルメーターの対応づけに使う） */
export interface PlayTrack {
  id: string
  /** 鳴らすか（ミュート・ソロ）。偽でも再生はしておき、音量 0 にする（再生中の切り替えをすぐ反映するため） */
  audible: boolean
  clip: Clip
}

const NO_TRACKS: PlayTrack[] = []
const NO_FADERS: Record<string, TrackFader> = {}

/** パンの処理。モノラルも左右同じ音のステレオにしてから掛ける（適用の panRange・書き出しの applyFader と同じ計算になるように） */
function makePanner(ctx: AudioContext) {
  const p = ctx.createStereoPanner()
  p.channelCount = 2
  p.channelCountMode = 'explicit'
  p.channelInterpretation = 'speakers'
  return p
}

/**
 * フェーダー（音量・パン）の値を、つないだノードに入れる。再生中に動かしたときは途切れないよう少しだけならし、
 * 再生を始めるとき（`immediate`）はそのまま入れる（出だしの音量がずれないように）
 */
function setFaderNodes(n: { gain: GainNode; pan: StereoPannerNode }, f: TrackFader, immediate = false) {
  // 位相の反転は負の倍率として掛ける（書き出しの applyFader と同じ）
  if (immediate) {
    n.gain.gain.value = faderGain(f)
    n.pan.pan.value = f.pan
    return
  }
  const t = n.gain.context.currentTime
  n.gain.gain.setTargetAtTime(faderGain(f), t, 0.01)
  n.pan.pan.setTargetAtTime(f.pan, t, 0.01)
}

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
 * 再生位置・長さ・終わりは `clip` が基準。`muted` なら `clip` は鳴らさない（ミュート・ソロ。再生中に切り替えてもすぐ反映する）。
 * `liveGain` は適用前の音量で、再生中に変えてもすぐ反映する（`clip` の音だけに効く）。
 * `id` は `clip` のトラックの id。トラックごとと全体のレベルメーター用に、`analyser(id)` / `masterAnalysers()`（左・右）を返す
 */
export function usePlayer(
  clip: Clip | null,
  opts: {
    id?: string
    others?: PlayTrack[]
    muted?: boolean
    liveGain?: LiveGain | null
    faders?: Record<string, TrackFader>
    /** 音量の帯に描いた曲線（dB、`hopSec` 間隔）。再生にすぐ反映する（`clip` の音だけに効く） */
    gainCurve?: { db: Float32Array; hopSec: number } | null
    /** 繰り返す範囲（ループ再生）。範囲の中から再生したら終わりで先頭へ戻り、範囲の外から再生したら終わりまで鳴らしてから先頭へ戻る */
    loop?: Range | null
  } = {},
) {
  const { id = 'main', others = NO_TRACKS, muted = false, liveGain = null, faders = NO_FADERS, gainCurve = null, loop = null } = opts
  const loopRef = useRef(loop)
  loopRef.current = loop
  const gainCurveRef = useRef(gainCurve)
  gainCurveRef.current = gainCurve
  /** 音量の曲線を掛けるノード（再生のたびに作る） */
  const curveNodeRef = useRef<GainNode | null>(null)
  const fadersRef = useRef(faders)
  fadersRef.current = faders
  /** トラックごとのフェーダーのノード（再生のたびに作る。動かしたらここへ値を入れる） */
  const faderNodes = useRef(new Map<string, { gain: GainNode; pan: StereoPannerNode }>())
  /** トラックごとの「鳴らす / 鳴らさない」（音量 1 / 0）。ミュート・ソロを切り替えたらここを変える */
  const muteNodes = useRef(new Map<string, GainNode>())
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
  /** 範囲試聴の終わり（通常再生なら undefined）。クリップが切り替わって再生し直すときに使う */
  const playToRef = useRef<number | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  /** 再生のたびに作る、音源より後ろの部品（音量・パン・フェーダー・ミュート・メーター）。止めたらすべて切り離す */
  const nodesRef = useRef<AudioNode[]>([])

  /**
   * 鳴らしている音をすべて止めて、再生のたびに作った部品を切り離す
   * （切り離さないと全体の出口につながったまま残り、無音を処理し続ける。再生を繰り返すほど増えて重くなった）。
   * `suspend` なら AudioContext も一時停止して、止まっている間の音声処理を止める（すぐ再生し直すときは偽）
   */
  const stopSource = useCallback((suspend = true) => {
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
    for (const n of nodesRef.current) n.disconnect()
    nodesRef.current = []
    analysersRef.current.clear()
    faderNodes.current.clear()
    muteNodes.current.clear()
    const ctx = ctxRef.current
    if (suspend && ctx?.state === 'running') void ctx.suspend()
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

  /**
   * 音量の曲線を、今の位置から終わりまで予約する（描いている途中でも呼び直し、今から先を入れ直す）。
   * フレームの間は直線でつなぐ（適用の applyGainCurve と同じ値になる）
   */
  const scheduleCurve = useCallback(() => {
    const ctx = ctxRef.current
    const g = curveNodeRef.current?.gain
    if (!ctx || !g || !sourceRef.current) return
    const { ctxStart, offset, end } = clockRef.current
    const now = ctx.currentTime
    const pos = offset + Math.max(0, now - ctxStart)
    const c = gainCurveRef.current
    // 進行中の曲線の予約と重なると、ブラウザによってはエラーになるので、予約はすべて消してから入れ直す
    g.cancelScheduledValues(0)
    if (!c || end - pos < 0.02) {
      g.setValueAtTime(1, now)
      return
    }
    const at = (t: number) => {
      const f = t / c.hopSec
      const k = Math.min(c.db.length - 1, Math.floor(f))
      const k2 = Math.min(c.db.length - 1, k + 1)
      return 10 ** ((c.db[k] + (c.db[k2] - c.db[k]) * (f - k)) / 20)
    }
    const n = Math.max(2, Math.ceil((end - pos) / c.hopSec) + 1)
    const values = new Float32Array(n)
    for (let i = 0; i < n; i++) values[i] = at(pos + (i * (end - pos)) / (n - 1))
    try {
      g.setValueCurveAtTime(values, Math.max(now, ctxStart + (pos - offset)), end - pos)
    } catch {
      // 予約できなければ、今の位置の値だけ入れる（次に描き直したときにまた予約する）
      g.setValueAtTime(values[0], now)
    }
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
      // すぐ鳴らし直すので、AudioContext は止めない
      stopSource(false)
      const duration = clipDuration(clip)
      // ループ中に範囲の中から再生するときは、範囲の終わりまで
      const lp = loopRef.current
      if (to === undefined && lp && from >= lp.start && from < lp.end) to = lp.end
      const start = Math.max(0, Math.min(from, duration))
      const end = Math.max(start, Math.min(to ?? duration, duration))
      if (end - start < 1e-3) return
      const src = ctx.createBufferSource()
      src.buffer = bufferOf(clip)
      // 鳴らさないときも、再生位置と終わりの基準にするため音源は作る（音量 0 でつなぐ）
      const gain = ctx.createGain()
      // この再生で作った部品（止めたら stopSource が切り離す）
      const made: AudioNode[] = [gain]
      gainRef.current = gain
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
      made.push(meter)
      analysersRef.current.set(id, meter)
      // 適用前の音量・パン（範囲だけ） → トラックのフェーダー（全体） → メーター → 全体の出口
      const panner = makePanner(ctx)
      made.push(panner)
      const curveNode = ctx.createGain()
      made.push(curveNode)
      curveNodeRef.current = curveNode
      panRef.current = panner
      const fader = { gain: ctx.createGain(), pan: makePanner(ctx) }
      made.push(fader.gain, fader.pan)
      setFaderNodes(fader, fadersRef.current[id] ?? DEFAULT_FADER, true)
      faderNodes.current.set(id, fader)
      const mute = ctx.createGain()
      made.push(mute)
      mute.gain.value = muted ? 0 : 1
      muteNodes.current.set(id, mute)
      src.connect(gain).connect(panner).connect(curveNode).connect(fader.gain).connect(fader.pan).connect(mute).connect(meter).connect(master)
      src.onended = () => {
        // ループ中は範囲の先頭から鳴らし直す（音量の予約なども作り直すため、音源ごと作り直す）
        const l = loopRef.current
        if (l && l.end - l.start >= 1e-3) {
          void playRef.current(l.start, l.end)
          return
        }
        // 最後まで再生して止まったときも、部品を切り離して AudioContext を止める
        stopSource()
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
          made.push(m)
          analysersRef.current.set(o.id, m)
          const f = { gain: ctx.createGain(), pan: makePanner(ctx) }
          made.push(f.gain, f.pan)
          setFaderNodes(f, fadersRef.current[o.id] ?? DEFAULT_FADER, true)
          faderNodes.current.set(o.id, f)
          const mute = ctx.createGain()
          made.push(mute)
          mute.gain.value = o.audible ? 1 : 0
          muteNodes.current.set(o.id, mute)
          e.connect(f.gain).connect(f.pan).connect(mute).connect(m).connect(master)
          e.start(at, start, Math.min(end, clipDuration(o.clip)) - start)
          return e
        })
      nodesRef.current = made
      playToRef.current = to
      clockRef.current = { ctxStart: at, offset: start, end }
      scheduleGain()
      scheduleCurve()
      setPosition(start)
      setPlaying(true)
    },
    [clip, id, others, muted, stopSource, scheduleGain, scheduleCurve],
  )
  /** 最新の play（再生の終わりの onended から、その時点のクリップ・トラックで鳴らし直すため） */
  const playRef = useRef(play)
  playRef.current = play

  // 描いた音量の曲線が変わったら、再生中でもすぐ反映する
  useEffect(() => {
    scheduleCurve()
  }, [gainCurve, scheduleCurve])

  // 再生中にフェーダーを動かしたら、すぐ反映する
  useEffect(() => {
    for (const [trackId, n] of faderNodes.current) setFaderNodes(n, faders[trackId] ?? DEFAULT_FADER)
  }, [faders])

  // 再生中に適用前の音量が変わったら、すぐ反映する
  const gainKey = liveGain ? `${liveGain.db}:${liveGain.pan}:${liveGain.ranges.map((r) => `${r.start}-${r.end}`).join(',')}` : ''
  useEffect(() => {
    scheduleGain()
  }, [gainKey, scheduleGain])

  // 再生中にミュート・ソロを切り替えたら、すぐ反映する（途切れないよう少しだけならす）
  const audibleKey = `${muted ? 0 : 1}|${others.map((o) => `${o.id}:${o.audible ? 1 : 0}`).join(',')}`
  useEffect(() => {
    const set = (trackId: string, on: boolean) => {
      const n = muteNodes.current.get(trackId)
      if (n) n.gain.setTargetAtTime(on ? 1 : 0, n.context.currentTime, 0.01)
    }
    set(id, !muted)
    for (const o of others) set(o.id, o.audible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audibleKey, id])

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

  // クリップが切り替わったら（トラックの切り替え・原音と加工後の切り替えなど）、再生中なら同じ位置から新しいクリップで続ける。
  // 新しいクリップの終わりを過ぎていれば止め、再生位置を範囲内に収める
  const prevClipRef = useRef(clip)
  useEffect(() => {
    if (prevClipRef.current === clip) return
    prevClipRef.current = clip
    const t = currentTime()
    if (t !== null && clip && t < clipDuration(clip) - 1e-3) {
      void play(t, playToRef.current)
      return
    }
    stopSource()
    setPlaying(false)
    setPosition((p) => (clip ? Math.min(p, clipDuration(clip)) : 0))
  }, [clip, play, currentTime, stopSource])

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
