import { useState } from 'react'
import type { Lane } from '../components/waveform/draw'

/**
 * 帯（上から波形・スペクトログラム・ピッチ）の表示・非表示と、フォーカスしている帯。
 * - どれか1本は必ず出す（隠して何も出ていなくなるときは、波形の帯を出す）
 * - 帯を出したら、その帯にフォーカスする。フォーカスしている帯を隠したら、出ている帯の一番上にフォーカスする
 * - ツールバーとショートカット（切り取り・コピー・貼り付けなど）は、フォーカスしている帯に効く
 */
export function useLanes() {
  const [showWave, setShowWaveState] = useState(true)
  const [showSpec, setShowSpecState] = useState(false)
  const [showPitch, setShowPitchState] = useState(false)
  const [focusState, setFocusLane] = useState<Lane>('wave')

  const shown: Lane[] = [showWave && 'wave', showSpec && 'spec', showPitch && 'pitch'].filter(Boolean) as Lane[]
  const focusLane: Lane = shown.includes(focusState) ? focusState : (shown[0] ?? 'wave')

  /** 波形の帯を出す・隠す（ほかに出ている帯が無ければ隠せない） */
  const setShowWave = (v: boolean) => {
    if (!v && !showPitch && !showSpec) return
    setShowWaveState(v)
  }
  const setShowSpec = (v: boolean) => {
    setShowSpecState(v)
    if (!v && !showPitch) setShowWaveState(true)
    if (v) setFocusLane('spec')
  }
  const setShowPitch = (v: boolean) => {
    setShowPitchState(v)
    if (!v && !showSpec) setShowWaveState(true)
    if (v) setFocusLane('pitch')
  }
  /** ファイルを開いたときに、波形だけの表示に戻す（前のファイルの表示を持ち越すと、開いた直後に重い解析が走るため） */
  const reset = () => {
    setShowWaveState(true)
    setShowSpecState(false)
    setShowPitchState(false)
    setFocusLane('wave')
  }

  return { showWave, setShowWave, showSpec, setShowSpec, showPitch, setShowPitch, focusLane, setFocusLane, reset }
}
