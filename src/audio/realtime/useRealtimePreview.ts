import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from '../types'
import type { GranularMessage } from './granularProcessor'
import processorUrl from './granularProcessor.ts?worker&url'

/**
 * 範囲をループ再生しながら、ピッチ・伸縮率の変更を即座に反映する（AudioWorklet）。
 * 音質は簡易的なグラニュラー方式で、適用時の処理（WSOLA / Phase Vocoder）とは異なる。
 */
export function useRealtimePreview(clip: Clip | null, range: Range | null, semitones: number, stretch: number) {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const [playing, setPlaying] = useState(false)

  const post = (m: GranularMessage, transfer: Transferable[] = []) => nodeRef.current?.port.postMessage(m, transfer)

  // start の await 中に stop・再 start されたら、古い start はノードを作らずに抜ける。
  // 作ってしまうと nodeRef から外れたノードが鳴り続け、止められなくなる
  const genRef = useRef(0)
  const readyRef = useRef<Promise<void>>(Promise.resolve())

  const stop = useCallback(() => {
    genRef.current++
    nodeRef.current?.disconnect()
    nodeRef.current = null
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
    // 読み込み中に別の start が来ても、同じ読み込みの完了を待つ
    await readyRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    if (gen !== genRef.current) return
    const s = Math.floor(range.start * clip.sampleRate)
    const e = Math.max(s + 1, Math.floor(range.end * clip.sampleRate))
    const channels = clip.channels.map((c) => c.slice(s, e))
    const node = new AudioWorkletNode(ctx, 'granular-preview', { outputChannelCount: [clip.channels.length] })
    nodeRef.current = node
    post({ type: 'load', channels }, channels.map((c) => c.buffer))
    post({ type: 'params', semitones, stretch })
    node.connect(ctx.destination)
    setPlaying(true)
    // semitones / stretch は下の effect で追従させるため、開始時の値だけ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, range?.start, range?.end, stop])

  // 再生中はスライダーの変更をそのまま送る
  useEffect(() => {
    if (playing) post({ type: 'params', semitones, stretch })
  }, [playing, semitones, stretch])

  // 対象のクリップや範囲が変わったら止める
  useEffect(() => stop, [clip, range?.start, range?.end, stop])

  useEffect(() => () => void ctxRef.current?.close(), [])

  return { playing, start, stop }
}
