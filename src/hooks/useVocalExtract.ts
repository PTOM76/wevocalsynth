import { useEffect } from 'react'
import { useConfirm } from 'pevenmui'
import type { Clip, Range } from '../audio/types'
import type { VocalModel } from '../settings/settings'
import type { Track } from '../audio/tracks'
import type { Project } from '../project/projectFile'
import { t } from '../i18n/i18n'
import { extractRanges, isOutOfMemory, planBackend, resolveModel, splitBoth, VOCAL_MODELS, type ExtractOptions, type ExtractStem } from '../audio/vocalExtract'
import { scheduleCleanExtract, type CleanJobBody } from '../project/cleanExtract'
import { clearExtracting, crashedDuringExtract, markExtracting } from '../project/extractGuard'

export { VOCAL_MODELS, type ExtractStem }

interface Deps {
  edited: Clip | null
  /** 対象（選択範囲、なければ全体） */
  editRanges: Range[]
  model: VocalModel
  /** GPU（WebGPU）を使ってよいか */
  gpu: boolean
  /** 約 11kHz より上を残す（モデルが扱わない帯域。残すと伴奏の高い音が混ざりやすい） */
  keepHighBand: boolean
  /** 実行環境のメモリの上限（MB） */
  memoryMb: number
  /** 追加機能が導入済みか確かめ、なければ導入の確認ダイアログを出す */
  ensure: (id: string, also?: string[]) => Promise<boolean>
  run: (label: string, task: (signal: AbortSignal) => Promise<void>) => Promise<void>
  setProgress: (p: number) => void
  commit: (clip: Clip, label: string) => void
  /** ボーカルを取り出したあとに呼ぶ（処理モードをボーカルにする） */
  onVocals: () => void
  notify: (message: string) => void
  /** トラックの一覧と、トラック `id` を別々のトラックに置き換える操作（ボーカルと伴奏に分けるとき） */
  tracks: Track[]
  activeId: string
  split: (parts: { name: string; clip: Clip }[], label: string, id: string) => void
  /** 抽出の前に行うこと（加工したトラックの原音を退避する） */
  prepare: () => Promise<void>
  /** 作業を保存する前に、退避した原音を戻す */
  restoreAll: () => Promise<void>
  /** 今の作業（メモリが足りないとき、保存して再読み込みしてから抽出するため） */
  snapshot: () => Project | null
  /** メモリを空けてから抽出する（作業を保存して開き直し、ほかに何も読み込んでいない状態で抽出する。設定） */
  fresh: boolean
  /** `fresh` の設定を有効にする */
  enableFresh: () => void
}

/**
 * ボーカル抽出（追加機能）。対象の範囲を、取り出したボーカル（または伴奏）に置き換えて履歴に積む。
 * 長さは変わらない。本体は audio/vocalExtract.ts。
 * メモリ不足で失敗したら、作業を保存して再読み込みし、画面を組み立てる前に抽出するかを確かめる（project/cleanExtract.ts）
 */
export function useVocalExtract(d: Deps) {
  const { confirm, dialog } = useConfirm()
  // この端末と非互換のモデルなら、代わりのモデルで抽出する（extractor/src/compat.ts。設定は変えない）
  const model = resolveModel(d.model).model
  const base = (): ExtractOptions => ({ model, gpu: d.gpu, keepHighBand: d.keepHighBand, memoryMb: d.memoryMb })
  /** 計算の種類を決め、モデルとそれに要る実行環境（ONNX Runtime の wasm）を導入済みにする。導入しなければ null */
  const prepareOptions = async (): Promise<ExtractOptions | null> => {
    const plan = await planBackend(base())
    if (!(await d.ensure(VOCAL_MODELS[model].addon, [plan.runtimeAddon]))) return null
    return { ...base(), backend: plan.backend }
  }

  // 前回、抽出の前後でアプリが落ちていたら、メモリを空けてから抽出する設定を勧める
  useEffect(() => {
    if (!crashedDuringExtract() || d.fresh) return
    void confirm({ message: t('extract.crashedConfirm'), okLabel: t('extract.crashedOk') }).then((ok) => ok && d.enableFresh())
    // 起動時に 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 作業を保存して開き直し、メモリを空けた状態で抽出する。開き直せなければ false */
  const runFresh = async (job: CleanJobBody, trackId: string, options: ExtractOptions) => {
    const trackIndex = d.tracks.findIndex((tr) => tr.id === trackId)
    if (!d.snapshot() || trackIndex < 0) return false
    await d.restoreAll()
    // 原音を戻してから作業を取る（退避中の原音は中身が空）
    await scheduleCleanExtract({ ...job, trackIndex, options }, d.snapshot()!)
    return true
  }

  /** メモリ不足なら、メモリを空けてから抽出するかを確かめる。ほかの失敗はそのまま投げる */
  const onFail = async (e: unknown, job: CleanJobBody, trackId: string, options: ExtractOptions) => {
    if (!isOutOfMemory(e)) throw e
    if (!d.snapshot()) throw new Error(t('extract.outOfMemory'))
    if (!(await confirm({ message: t('extract.cleanConfirm'), okLabel: t('extract.cleanOk') }))) return
    if (!(await runFresh(job, trackId, options))) throw new Error(t('extract.outOfMemory'))
  }

  const extract = async (stem: ExtractStem) => {
    const { edited, editRanges } = d
    if (!edited || !editRanges.length) return
    // 導入の確認ダイアログは、処理中の表示より先に出す
    const options = await prepareOptions()
    if (!options) return
    if (d.fresh && (await runFresh({ mode: 'extract', stem, ranges: editRanges }, d.activeId, options))) return
    await d.prepare()
    let failure: unknown = null
    let done = false
    markExtracting()
    await d.run(t(stem === 'vocals' ? 'task.extractVocals' : 'task.extractAccompaniment'), async (signal) => {
      try {
        const clip = await extractRanges(edited, editRanges, stem, options, d.setProgress, signal)
        if (signal.aborted) return
        d.commit(clip, t(stem === 'vocals' ? 'extract.vocals' : 'extract.accompaniment'))
        done = true
        clearExtracting(true)
        if (stem === 'vocals') d.onVocals()
        d.notify(t('toast.extracted'))
      } catch (e) {
        // メモリ不足は、処理中の表示を閉じてから確かめる
        if (!isOutOfMemory(e)) throw e
        failure = e
      }
    })
    // 失敗・中断したら印を外す（反映したときは、少し経ってから外れる）
    if (!done) clearExtracting()
    if (failure) await onFail(failure, { mode: 'extract', stem, ranges: editRanges }, d.activeId, options)
  }

  /** トラック `id`（既定は選んでいるもの）全体を、ボーカルと伴奏の2つのトラックに分ける（推論は1回） */
  const splitStems = async (id = d.activeId) => {
    const track = d.tracks.find((tr) => tr.id === id)
    if (!track) return
    const edited = track.clip
    const options = await prepareOptions()
    if (!options) return
    const vocalsName = t('track.vocalsName', { name: track.name })
    const accompanimentName = t('track.accompanimentName', { name: track.name })
    if (d.fresh && (await runFresh({ mode: 'split', vocalsName, accompanimentName }, id, options))) return
    await d.prepare()
    let failure: unknown = null
    let done = false
    markExtracting()
    await d.run(t('task.splitStems'), async (signal) => {
      try {
        const r = await splitBoth(edited, options, d.setProgress, signal)
        if (signal.aborted) return
        const sr = edited.sampleRate
        d.split(
          [
            { name: vocalsName, clip: { sampleRate: sr, channels: r.vocals } },
            { name: accompanimentName, clip: { sampleRate: sr, channels: r.accompaniment } },
          ],
          t('extract.split'),
          id,
        )
        done = true
        clearExtracting(true)
        d.onVocals()
        d.notify(t('toast.extracted'))
      } catch (e) {
        if (!isOutOfMemory(e)) throw e
        failure = e
      }
    })
    if (!done) clearExtracting()
    if (failure) await onFail(failure, { mode: 'split', vocalsName, accompanimentName }, id, options)
  }

  return { extract, splitStems, dialog }
}
