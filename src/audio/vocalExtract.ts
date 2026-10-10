// ボーカル抽出（手順は Extractor の host.ts。WeVocal Studio と共通。ここは表示の名前と、範囲に貼り直す処理だけ）
import type { Clip, Range } from './types'
import { spliceProcessed } from './edit'
import { normalizeRanges } from './multiRange'
import { addonFileUrl, installedManifest, loadAddon } from '../addons/addons'
import type { StemModel, VocalModel } from '../settings/settings'
import type { MessageKey } from '../i18n/i18n'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from './usePlayer'
import { isMobile } from 'pevenmui/web'
import * as host from '../../extractor/src/host'
import type * as ExtractorModule from '../../extractor/src/index'

/**
 * ボーカル抽出の本体（React に依存しない）。画面からの抽出（hooks/useVocalExtract.ts）と、
 * メモリが足りないときに再読み込みしてから行う抽出（project/cleanExtract.ts）の両方で使う
 */

export type ExtractStem = ExtractorModule.Stem
export type ExtractOptions = host.ExtractOptions & { model: VocalModel; stemModel?: StemModel }
export type ConfirmCpu = host.ConfirmCpu
export type InstrumentStems = host.InstrumentStems
export { LEAD_MODEL, EXTRACT_MODELS, isMdxModel, resolveModel, RUNTIME_ADDONS, isOutOfMemory, planBackend } from '../../extractor/src/host'

/** モデルの追加機能 ID（Extractor の表）と、表示する名前 */
const VOCAL_LABELS: Record<VocalModel, MessageKey> = {
  fp16: 'addon.modelLight',
  int8: 'addon.modelStandard',
  fp32: 'addon.modelPrecise',
  'voc-ft': 'addon.modelVocalHq',
  'inst-hq4': 'addon.modelInstHq',
  kara2: 'addon.modelLead',
}
export const VOCAL_MODELS = Object.fromEntries(Object.entries(host.VOCAL_MODELS).map(([k, v]) => [k, { ...v, label: VOCAL_LABELS[k as VocalModel] }])) as Record<VocalModel, { addon: string; mdx?: string; lead?: true; label: MessageKey }>
const STEM_LABELS: Record<StemModel, MessageKey> = { htdemucs: 'addon.modelStems4', htdemucs6s: 'addon.modelStems6' }
export const STEM_MODELS = Object.fromEntries(Object.entries(host.STEM_MODELS).map(([k, v]) => [k, { ...v, label: STEM_LABELS[k as StemModel] }])) as Record<StemModel, { addon: string; demucs: string; label: MessageKey }>

/** WebGPU のデバイスが失われたときに呼ぶ（画面がブラウザの再起動を勧める） */
let gpuLostHandler: ((message: string) => void) | undefined
export const setGpuLostHandler = (f: ((message: string) => void) | undefined) => {
  gpuLostHandler = f
}

/**
 * 抽出の手順。抽出は数百MB使うので、先に加工と解析の Worker（wasm のメモリ）と、再生用の音声の複製を手放す（iOS はタブのメモリの上限が低い）
 */
const h = host.createHost({
  loadAddon: (id) => loadAddon(id),
  installedManifest,
  addonFileUrl,
  beforeOpen: () => {
    releaseIdleDsp()
    releasePlayers()
  },
  isMobile,
  onGpuLost: (message) => gpuLostHandler?.(message),
})

/** 診断用（debug/diagnoseExtract.ts） */
export const openExtractor = h.openExtractor
/** 抽出中か（診断で実行環境を作ると、抽出のモデルを入れ替えてしまう） */
export const isExtracting = h.isExtracting

/** `clip` の範囲（秒）を、取り出したボーカル（または伴奏）に置き換えた音声を返す。長さは変わらない */
export function extractRanges(clip: Clip, ranges: Range[], stem: ExtractStem, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) {
  return h.withExtractor(
    o,
    signal,
    async (extractor) => {
      const list = normalizeRanges(ranges)
      const sr = clip.sampleRate
      const len = clip.channels[0].length
      let cur = clip
      for (const [i, r] of list.entries()) {
        const s = Math.max(0, Math.min(len, Math.round(r.start * sr)))
        const e = Math.max(s, Math.min(len, Math.round(r.end * sr)))
        if (e - s < 1) continue
        const channels = await extractor.separate(
          cur.channels.map((c) => c.subarray(s, e)),
          sr,
          { stem, highBand: o.keepHighBand ? 'edge' : 'zeros', onProgress: (p) => onProgress((i + p) / list.length) },
        )
        // 長さは変わらないので、前の範囲の位置はずれない
        cur = spliceProcessed(cur, { s, e, channels }).clip
      }
      return cur
    },
    confirmCpu,
  )
}

/** `clip` 全体を、ボーカルと伴奏に分ける（推論は1回） */
export const splitBoth = (clip: Clip, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) =>
  h.splitBoth(clip.channels, clip.sampleRate, o, onProgress, signal, confirmCpu)

/** `clip` 全体を、主旋律、ハモリ、伴奏に分ける（推論は 2 回） */
export const splitLead = (clip: Clip, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) =>
  h.splitLead(clip.channels, clip.sampleRate, o, onProgress, signal, confirmCpu)

/** `clip` 全体を、楽器ごとに分ける（`chorus` なら、ボーカルをさらに主旋律とハモリに分ける） */
export const splitInstruments = (clip: Clip, o: ExtractOptions, chorus: boolean, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) =>
  h.splitInstruments(clip.channels, clip.sampleRate, o, chorus, onProgress, signal, confirmCpu)
