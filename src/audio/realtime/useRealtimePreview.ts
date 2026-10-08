// 範囲をループ再生しながら、ピッチと伸縮率の変更をすぐ反映する（AudioWorklet）
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from '../types'
import { startContext } from 'wevocal-lib'
import type { GranularMessage, GranularPosition } from './granularProcessor'
import processorUrl from './granularProcessor.ts?worker&url'

/**
 * 範囲をループ再生しながら、ピッチ・伸縮率の変更を即座に反映する（AudioWorklet）。
 * 音質は簡易的なグラニュラー方式で、適用時の処理（WSOLA / Phase Vocoder）とは異なる。
 */
export function useRealtimePreview(clip: Clip | null, range: Range | null, semitones: number, stretch: number, align = true) {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const [playing, setPlaying] = useState(false)

  const post = (m: GranularMessage, transfer: Transferable[] = []) => nodeRef.current?.port.postMessage(m, transfer)

  // start の await 中に stop・再 start されたら、古い start はノードを作らずに抜ける。
  // 作ってしまうと nodeRef から外れたノードが鳴り続け、止められなくなる
  const genRef = useRef(0)
  const readyRef = useRef<Promise<void>>(Promise.resolve())
  /** ループしている範囲（秒の先頭・サンプル数）と、worklet から最後に知らされた読み位置 */
  const loopRef = useRef<{ start: number; samples: number; sampleRate: number } | null>(null)
  const reportRef = useRef<GranularPosition | null>(null)
  /** 前に返した位置（範囲の先頭からのサンプル数。折り返す前の値） */
  const lastRef = useRef<number | null>(null)
  /** 最後に移った時刻（これより前の位置の知らせは古い） */
  const seekTimeRef = useRef(0)
  const stretchRef = useRef(stretch)
  stretchRef.current = stretch

  const stop = useCallback(() => {
    genRef.current++
    nodeRef.current?.disconnect()
    nodeRef.current = null
    // 止めている間は音声処理も止める（動かしたままだと、開いている間ずっと CPU を使う）。start で再開する
    const ctx = ctxRef.current
    if (ctx?.state === 'running') void ctx.suspend()
    setPlaying(false)
  }, [])

  const start = useCallback(async () => {
    if (!clip || !range) return
    stop()
    const gen = genRef.current
    // 開始待ちの間も「再生中」として見せ、もう一度押したら止められるようにする
    setPlaying(true)
    // 元音声と同じサンプルレートのコンテキストを使い、ブラウザ側のリサンプルを避ける
    let ctx = ctxRef.current
    if (!ctx || ctx.sampleRate !== clip.sampleRate) {
      ctxRef.current = null
      void ctx?.close()
      ctx = new AudioContext({ sampleRate: clip.sampleRate })
      ctxRef.current = ctx
      readyRef.current = ctx.audioWorklet.addModule(processorUrl)
    }
    // resume は読み込みを待つ前に呼ぶ（iOS は操作の後に await を挟むと resume を受け付けない）
    const started = startContext(ctx, 'loop')
    // 読み込み中に別の start が来ても、同じ読み込みの完了を待つ
    await readyRef.current
    await started
    if (gen !== genRef.current) return
    const s = Math.floor(range.start * clip.sampleRate)
    const e = Math.max(s + 1, Math.floor(range.end * clip.sampleRate))
    const channels = clip.channels.map((c) => c.slice(s, e))
    const node = new AudioWorkletNode(ctx, 'granular-preview', { outputChannelCount: [clip.channels.length] })
    nodeRef.current = node
    reportRef.current = null
    loopRef.current = { start: range.start, samples: e - s, sampleRate: clip.sampleRate }
    lastRef.current = null
    seekTimeRef.current = 0
    node.port.onmessage = (m: MessageEvent<GranularPosition>) => {
      if (m.data.time > seekTimeRef.current) reportRef.current = m.data
    }
    post({ type: 'load', channels }, channels.map((c) => c.buffer))
    post({ type: 'params', semitones, stretch })
    post({ type: 'align', on: alignRef.current })
    node.connect(ctx.destination)
    setPlaying(true)
    // semitones / stretch は下の effect で追従させるため、開始時の値だけ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, range?.start, range?.end, stop])

  // 再生中はスライダーの変更をそのまま送る
  useEffect(() => {
    if (playing) post({ type: 'params', semitones, stretch })
  }, [playing, semitones, stretch])

  // グレインの位置合わせ（設定の開発者向けで切り替え）。再生中に変えてもすぐ反映する
  const alignRef = useRef(align)
  alignRef.current = align
  useEffect(() => {
    if (playing) post({ type: 'align', on: align })
  }, [playing, align])

  // 対象のクリップや範囲が変わったら止める
  useEffect(() => stop, [clip, range?.start, range?.end, stop])

  useEffect(() => () => void ctxRef.current?.close(), [])

  /**
   * 今鳴らしている元音声上の位置（秒。再生位置の線用）。最後に知らされた読み位置から、
   * 経った時間ぶん（読み位置は出力 1 サンプルあたり 1 / 伸縮率 進む）を足して範囲内に折り返す。始まる前は範囲の先頭
   */
  const livePosition = useCallback(() => {
    const l = loopRef.current
    const r = reportRef.current
    const ctx = ctxRef.current
    if (!l) return 0
    if (!r || !ctx) return l.start
    let p = r.pos + ((ctx.currentTime - r.time) * l.sampleRate) / r.stretch
    // 時刻の読み取りのずれで少し戻ることがあるので、折り返し（大きく戻る）以外では戻さない
    const last = lastRef.current
    if (last !== null && p < last && last - p < l.samples / 2) p = last
    lastRef.current = p
    return l.start + (((p % l.samples) + l.samples) % l.samples) / l.sampleRate
  }, [])

  /** ループ中に範囲内の `t`（秒）へ移る。範囲外なら何もせず false */
  const seek = useCallback((t: number) => {
    const l = loopRef.current
    const ctx = ctxRef.current
    if (!nodeRef.current || !l || !ctx) return false
    const pos = Math.round((t - l.start) * l.sampleRate)
    if (pos < 0 || pos >= l.samples) return false
    post({ type: 'seek', pos })
    // 移る前に送られていた位置の知らせは捨てる
    seekTimeRef.current = ctx.currentTime
    reportRef.current = { pos, time: ctx.currentTime, stretch: stretchRef.current }
    lastRef.current = null
    return true
  }, [])

  return { playing, start, stop, livePosition, seek }
}
