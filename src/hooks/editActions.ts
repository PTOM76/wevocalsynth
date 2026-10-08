// 音声を書き換える操作（加工の適用、テンポの伸縮、区間の伸縮、サンプラー、曲線の書き込み）
import type { Dispatch, SetStateAction } from 'react'
import { applyFormantCurve, applyGainCurve, applyPitchCurve, spliceProcessed } from '../audio/edit'
import { applyEq, flatEq, isFlatEq } from '../audio/eq'
import { applyEditToRanges, sliceRanges } from '../audio/multiRange'
import { restoreClip } from '../audio/originalStore'
import { placeOnNotes } from '../audio/sampler'
import type { Clip, Range } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import type { SamplerOptions } from '../components/SamplerDialog'
import { kanaVowelDemo, processAudio } from '../dsp/engine'
import { t } from '../i18n/i18n'
import type { ProjectTempo } from '../project/projectFile'
import type { Settings } from '../settings/settings'
import type { Toast } from './useEditor'
import type { useFormantCurve } from './useFormantCurve'
import type { useHistory } from './useHistory'
import type { useLaneCurve } from './useLaneCurve'
import { CURVE_HOP_SEC } from './useLaneCurve'
import type { usePitchTarget } from './usePitchTarget'
import type { usePreview } from './usePreview'
import type { useTask } from './useTask'
import type { useTracks } from './useTracks'

/** 加工パラメータのうち、適用後やファイルを開いたときに戻す値 */
export const NEUTRAL = { semitones: 0, stretch: 1, formantSemitones: 0 }

/** 加工を適用したときの、操作履歴に出す名前（変えた項目だけを並べる） */
function applyLabel(p: EditParams): string {
  const parts: string[] = []
  const signed = (v: number) => `${v > 0 ? '+' : ''}${+v.toFixed(3)}`
  if (p.semitones !== 0) parts.push(`${t('process.pitch')} ${signed(p.semitones)}`)
  if (p.stretch !== 1) parts.push(`${t('process.length')} ×${+p.stretch.toFixed(3)}`)
  if (p.preserveFormant && p.formantSemitones !== 0) parts.push(`${t('process.formantShift')} ${signed(p.formantSemitones)}`)
  return parts.join('・') || t('common.apply')
}

/** editActions に渡す、エディタの状態と操作（useEditor の中の値） */
export interface EditContext {
  task: ReturnType<typeof useTask>
  history: ReturnType<typeof useHistory>
  tracks: ReturnType<typeof useTracks>
  edited: Clip | null
  shown: Clip | null
  /** 加工の対象（選択範囲、なければ全体） */
  editRanges: Range[]
  multi: boolean
  preview: ReturnType<typeof usePreview>
  params: EditParams
  setParams: Dispatch<SetStateAction<EditParams>>
  /** 加工した音声を履歴に積む */
  commit: (clip: Clip, label: string) => void
  selections: Range[]
  setSelections: (rs: Range[]) => void
  setToast: (toast: Toast | null) => void
  projectTempo: ProjectTempo
  setProjectTempo: (patch: Partial<ProjectTempo>) => void
  settings: Settings
  pitch: Float32Array | null
  pitchTarget: ReturnType<typeof usePitchTarget>
  gainCurve: ReturnType<typeof useLaneCurve>
  formantCurve: ReturnType<typeof useFormantCurve>
}

/** 音声を書き換える操作（加工の適用、テンポの伸縮、区間の伸縮、サンプラー、曲線の書き込み）。どれも task.run の中で行い、結果を履歴に積む */
export function editActions(c: EditContext) {
  const { task, history, tracks, edited, shown, editRanges, multi, preview, params, setParams, commit, selections, setSelections, setToast, projectTempo, setProjectTempo, settings, pitch, pitchTarget, gainCurve, formantCurve } = c
  const { setProgress } = task
const apply = () =>
  task.run(t('task.processing'), async (signal) => {
    if (!edited || !editRanges.length) return
    // 同じ設定のプレビューがあれば、それを差し込むだけで済ませる
    const spliced = preview.result && !multi ? spliceProcessed(edited, preview.result) : null
    const result = spliced
      ? { clip: spliced.clip, ranges: [spliced.range] }
      : await applyEditToRanges(edited, editRanges, params, setProgress)
    // 中断されていたら結果を使わない（ほかの処理も同じ）
    if (signal.aborted) return
    commit(result.clip, applyLabel(params))
    setSelections(selections.length ? result.ranges : [])
    setParams((p) => ({ ...p, ...NEUTRAL }))
    setToast({ severity: 'success', message: t('toast.applied') })
  })

/**
 * テンポを手で変える。設定（テンポに合わせて全体を伸縮）が有効なら、全トラックの加工後と原音を「旧 BPM ÷ 新 BPM」倍に
 * 伸縮し（ピッチは変えない。処理方式は今の加工の欄のもの）、1拍目の位置と選択範囲も同じ比で動かす。
 * テンポは元に戻す履歴に入らないので、元に戻すと音声だけが戻る
 */
const changeTempo = (bpm: number) => {
  const old = projectTempo.bpm
  const same = !(old > 0) || !(bpm > 0) || Math.abs(bpm - old) < 1e-6
  if (!settings.tempoStretch || same || !history.tracks.length) return setProjectTempo({ bpm })
  const ratio = old / bpm
  void task.run(t('task.tempoStretch'), async (signal) => {
    const opts = { ...params, ...NEUTRAL, stretch: ratio }
    const list = history.tracks
    const done: typeof list = []
    for (const [i, tr] of list.entries()) {
      const run = async (c: Clip, part: number) =>
        ({ sampleRate: c.sampleRate, channels: await processAudio(c.channels, c.sampleRate, opts, (p) => setProgress((i + (part + p) / 2) / list.length)) })
      const clip = await run(tr.clip, 0)
      // 加工していないトラックは、原音と加工後が同じものなので1回で済ませる（退避した原音は戻してから）
      if (tr.original !== tr.clip) await restoreClip(tr.original)
      const original = tr.original === tr.clip ? clip : await run(tr.original, 1)
      if (signal.aborted) return
      done.push({ ...tr, clip, original })
    }
    history.setTracks(done, history.activeId, t('history.tempoStretch', { from: old, to: bpm }))
    setProjectTempo({ bpm, beatOffset: projectTempo.beatOffset * ratio })
    setSelections(selections.map((r) => ({ start: r.start * ratio, end: r.end * ratio })))
  })
}

// Shift+右端ドラッグ: 範囲をドラッグ後の長さに伸縮する（ピッチは変えない）
const stretchRange = (r: Range, dur: number) =>
  task.run(t('task.stretching'), async (signal) => {
    if (!edited) return
    const opts = { ...params, ...NEUTRAL, stretch: dur / (r.end - r.start) }
    const result = await applyEditToRanges(edited, [r], opts, setProgress)
    if (signal.aborted) return
    commit(result.clip, t('history.stretch', { ratio: opts.stretch.toFixed(2) }))
    setSelections(result.ranges)
  })

/** 区間ごとに長さを変える（音符ブロックの移動・端の伸縮）。後ろから処理して、前の区間の位置をずらさない */
const retime = (parts: { start: number; end: number; dur: number }[]) =>
  task.run(t('task.stretching'), async (signal) => {
    if (!edited) return
    let clip = edited
    const list = parts.filter((p) => p.end > p.start && p.dur > 0 && Math.abs(p.dur - (p.end - p.start)) > 1e-4).sort((a, b) => b.start - a.start)
    for (const [i, p] of list.entries()) {
      const opts = { ...params, ...NEUTRAL, stretch: p.dur / (p.end - p.start) }
      clip = (await applyEditToRanges(clip, [p], opts, (v) => setProgress((i + v) / list.length))).clip
      if (signal.aborted) return
    }
    if (list.length) commit(clip, t('history.retime'))
  })

/** 選択範囲（なければ全体）を素材にして MIDI の音符に並べ、新しいトラックにする */
const placeOnMidi = (o: SamplerOptions) =>
  task.run(t('task.sampler'), async (signal) => {
    const active = history.tracks.find((tr) => tr.id === history.activeId)
    if (!edited || !active) return
    const sample = selections.length ? sliceRanges(edited, selections) : edited
    const clip = await placeOnNotes(sample, o.notes, o.baseNote, o.fit, { ...params, ...NEUTRAL }, setProgress)
    if (signal.aborted) return
    tracks.addClip(clip, t('sampler.trackName', { name: active.name, midi: o.midiName }))
  })

/** 声から五十音を作る（試験的）の試し: 選択範囲（なければ全体。素材がクリップしているときなどに全体を使える）を母音 `vowel`（0〜4 が あ〜お）の声として、あいうえおを作って新しいトラックにする */
const kanaDemo = (vowel: number) =>
  task.run(t('task.kanaDemo'), async (signal) => {
    const active = history.tracks.find((tr) => tr.id === history.activeId)
    if (!edited || !active) return
    const sample = selections.length ? sliceRanges(edited, selections.slice(0, 1)) : edited
    const out = await kanaVowelDemo(sample.channels, sample.sampleRate, vowel, settings.kanaStrength / 100)
    if (signal.aborted) return
    if (!out) return setToast({ severity: 'error', message: t('kana.noVoice') })
    tracks.addClip({ sampleRate: sample.sampleRate, channels: [out] }, t('kana.demoTrack', { name: active.name }))
  })

const applyCurve = () =>
  task.run(t('task.curve'), async (signal) => {
    const target = pitchTarget.target
    if (!edited || !pitch || shown !== edited || target?.clip !== edited) return
    const next = await applyPitchCurve(edited, pitch, target.hz, params, setProgress)
    if (signal.aborted) return
    if (next) {
      commit(next, t('history.curve'))
      setToast({ severity: 'success', message: t('toast.applied') })
    }
    pitchTarget.clear()
  })

/** 描いた音量の曲線を音声に書き込み、履歴に積む */
const applyGain = () => {
  const c = gainCurve.curve
  if (!edited || c?.clip !== edited) return
  commit(applyGainCurve(edited, c.values, CURVE_HOP_SEC), t('gainCurve.label'))
  gainCurve.clear()
  setToast({ severity: 'success', message: t('toast.applied') })
}

/** 描いたフォルマントの曲線を音声に書き込み、履歴に積む */
const applyFormant = () =>
  task.run(t('task.formant'), async (signal) => {
    const c = formantCurve.curve
    if (!edited || c?.clip !== edited) return
    const r = await applyFormantCurve(edited, c.values, CURVE_HOP_SEC, setProgress)
    if (signal.aborted) return
    if (r) {
      commit(r.clip, t('formantCurve.label'))
      setToast({ severity: 'success', message: t('toast.applied') })
    }
    formantCurve.clear()
  })

/** 選んでいるトラックの EQ を音声に書き込み、履歴に積む。書き込んだら EQ は平らに戻す（二重に掛からないように） */
const applyTrackEq = () =>
  task.run(t('task.processing'), async (signal) => {
    const eq = tracks.eqOf(tracks.activeId)
    if (!edited || isFlatEq(eq)) return
    const clip = await applyEq(edited, eq)
    if (signal.aborted) return
    commit(clip, t('eq.historyLabel'))
    tracks.setEq(tracks.activeId, { ...flatEq(eq.bands), on: eq.on, range: eq.range })
    setToast({ severity: 'success', message: t('toast.applied') })
  })

  return { apply, changeTempo, stretchRange, retime, placeOnMidi, kanaDemo, applyCurve, applyGain, applyFormant, applyTrackEq }
}
