// メモリが足りないときの抽出（再読み込みしてから抽出する）
import type { Clip, Range } from '../audio/types'
import type { Project } from './projectFile'
import { idbDelete, idbGet, idbPut } from './idb'
import { extractRanges, splitBoth, type ExtractOptions, type ExtractStem } from '../audio/vocalExtract'
import { slotKey } from './windowSlot'

/**
 * メモリが足りないときの抽出。作業を IndexedDB に置いてページを再読み込みし、画面を組み立てる前（ほかに何も読み込んでいない状態）で抽出する。
 * iOS はタブのメモリの上限が低く、波形や解析の結果を持った画面のままでは抽出の実行環境を作れないことがあった。
 *
 * 1. 画面: `scheduleCleanExtract` で作業（Project）・対象の音声・抽出の内容を保存して再読み込み
 * 2. 起動（main.tsx）: `pendingCleanJob` があれば、軽い画面で `runCleanJob` を行い、結果を保存して再読み込み
 * 3. 起動（useEditor）: `takeCleanResult` で、結果を反映した作業を開く（元に戻す履歴は、通常の再読み込みと同じく残らない）
 */

/** 抽出の内容。`trackIndex` は Project の何番目のトラックか */
export type CleanJobBody = { mode: 'extract'; stem: ExtractStem; ranges: Range[] } | { mode: 'split'; vocalsName: string; accompanimentName: string }
export type CleanJob = { trackIndex: number; options: ExtractOptions } & CleanJobBody

// ウィンドウごとに分ける（windowSlot.ts。枠を取った後に読むので関数にする）
const JOB_KEY = () => slotKey('cleanExtract:job')
const PROJECT_KEY = () => slotKey('cleanExtract:project')
const TARGET_KEY = () => slotKey('cleanExtract:target')
const RESULT_KEY = () => slotKey('cleanExtract:result')

type CleanResult = { mode: 'extract'; stem: ExtractStem; clip: Clip } | { mode: 'split'; vocals: Clip; accompaniment: Clip }

/** 作業と抽出の内容を保存して、再読み込みする */
export async function scheduleCleanExtract(job: CleanJob, project: Project) {
  await idbPut(PROJECT_KEY(), project)
  await idbPut(TARGET_KEY(), project.tracks[job.trackIndex].edited)
  await idbPut(JOB_KEY(), job)
  location.reload()
}

/** 起動時に、結果を反映する作業があるか（起動時の自動保存の復元をしないため。main.tsx が描画の前に調べる） */
let bootPending = false
export async function checkCleanBoot() {
  bootPending = !!(await idbGet(PROJECT_KEY()).catch(() => null))
}
export const cleanBootPending = () => bootPending

/** 起動時に、行う抽出があるか */
export const pendingCleanJob = async () => ((await idbGet(JOB_KEY()).catch(() => null)) as CleanJob | null) ?? null

/** 再読み込み直後の抽出。結果を保存し、抽出の内容と対象の音声を消す（失敗したら例外。呼び出し側で `cancelCleanJob`） */
export async function runCleanJob(job: CleanJob, onProgress: (p: number) => void) {
  const target = (await idbGet(TARGET_KEY())) as Clip
  let result: CleanResult
  if (job.mode === 'extract') {
    result = { mode: 'extract', stem: job.stem, clip: await extractRanges(target, job.ranges, job.stem, job.options, onProgress) }
  } else {
    const r = await splitBoth(target, job.options, onProgress)
    const sr = target.sampleRate
    result = { mode: 'split', vocals: { sampleRate: sr, channels: r.vocals }, accompaniment: { sampleRate: sr, channels: r.accompaniment } }
  }
  // 結果は、反映のために抽出の内容と一緒に置く
  await idbPut(RESULT_KEY(), { job, result })
  await idbDelete(TARGET_KEY())
  await idbDelete(JOB_KEY())
}

/** 抽出をやめる（失敗したとき）。作業は結果なしでそのまま開き直す */
export async function cancelCleanJob() {
  await idbDelete(TARGET_KEY())
  await idbDelete(JOB_KEY())
}

/**
 * 抽出の結果を反映した作業（なければ null）。読んだら消す。`vocals` はボーカルを取り出したか（処理モードをボーカルにする）。
 * 抽出をやめたときは、作業だけを返す（`extracted` が偽）
 */
export async function takeCleanResult(): Promise<{ project: Project; extracted: boolean; vocals: boolean } | null> {
  const project = (await idbGet(PROJECT_KEY()).catch(() => null)) as Project | null
  if (!project) return null
  const saved = (await idbGet(RESULT_KEY()).catch(() => null)) as { job: CleanJob; result: CleanResult } | null
  await idbDelete(PROJECT_KEY())
  await idbDelete(RESULT_KEY())
  if (!saved) return { project, extracted: false, vocals: false }
  const { job, result } = saved
  const tracks = [...project.tracks]
  const tr = tracks[job.trackIndex]
  if (result.mode === 'extract') {
    tracks[job.trackIndex] = { ...tr, edited: result.clip }
  } else if (job.mode === 'split') {
    // 元のトラックを、ボーカルと伴奏の2つに置き換える（フェーダーなどは元のトラックのものを引き継ぐ）
    tracks.splice(job.trackIndex, 1, { ...tr, name: job.vocalsName, original: result.vocals, edited: result.vocals }, { ...tr, name: job.accompanimentName, original: result.accompaniment, edited: result.accompaniment })
  }
  return { project: { ...project, tracks }, extracted: true, vocals: result.mode === 'split' || result.stem === 'vocals' }
}
