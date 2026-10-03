import type { Clip, Range } from './types'
import { spliceProcessed } from './edit'
import { normalizeRanges } from './multiRange'
import { addonFileUrl, installedManifest, loadAddon } from '../addons/addons'
import type { VocalModel } from '../settings/settings'
import type { MessageKey } from '../i18n/i18n'
import { backendAllowed, effectiveModel } from '../../extractor/src/compat'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from './usePlayer'
import { isMobile } from '../project/fileAccess'
// 型だけ使う（中身は追加機能として後から読み込む）
import type * as ExtractorModule from '../../extractor/src/index'

/**
 * ボーカル抽出の本体（React に依存しない）。画面からの抽出（hooks/useVocalExtract.ts）と、
 * メモリが足りないときに再読み込みしてから行う抽出（project/cleanExtract.ts）の両方で使う
 */

export type ExtractStem = ExtractorModule.Stem

/**
 * モデルの追加機能 ID と、表示する名前。端末との互換性（WebGPU を使えない、別のモデルに替える）は
 * extractor/src/compat.ts にまとめる（モデルを足したら、ここと互換性の表に足す）
 */
export const VOCAL_MODELS: Record<VocalModel, { addon: string; label: MessageKey }> = {
  fp16: { addon: 'spleeter-fp16', label: 'addon.modelLight' },
  int8: { addon: 'spleeter-int8', label: 'addon.modelStandard' },
  fp32: { addon: 'spleeter-fp32', label: 'addon.modelPrecise' },
}

/** この端末で実際に使うモデル（非互換なら代わりのもの）と、替えたか */
export function resolveModel(model: VocalModel): { model: VocalModel; replaced: boolean } {
  const r = effectiveModel(model, Object.keys(VOCAL_MODELS))
  return { model: r.model as VocalModel, replaced: r.reason !== null }
}

/** 抽出の設定（設定の「ボーカル抽出」） */
export interface ExtractOptions {
  model: VocalModel
  /** GPU（WebGPU）を使ってよいか */
  gpu: boolean
  /** 約 11kHz より上を残す（モデルが扱わない帯域。残すと伴奏の高い音が混ざりやすい） */
  keepHighBand: boolean
  /** 抽出の実行環境の wasm のメモリの上限（MB。設定の開発者向け。なければ既定の 1GB） */
  memoryMb?: number
  /** 計算の種類（`planBackend` で決めたもの。なければ抽出のときに決める） */
  backend?: ExtractorModule.Backend
}

/** ONNX Runtime の wasm の追加機能（WebGPU 対応版 / WASM 版。要る方だけを入れる。scripts/build-addons.mjs） */
export const RUNTIME_ADDONS: Record<ExtractorModule.Runtime, string> = { gpu: 'vocal-extractor-gpu', cpu: 'vocal-extractor-cpu' }

/** メモリ不足で失敗したか（iOS は RangeError: out of memory か、実行環境を作れず no available backend found になる） */
export const isOutOfMemory = (e: unknown) => /out of memory|no available backend/i.test(String(e))

/** WebGPU が使えるか（アダプターが取れるか） */
async function hasWebGpu() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  try {
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

const runtimeOf = (backend: ExtractorModule.Backend): ExtractorModule.Runtime => (backend === 'webgpu' ? 'gpu' : 'cpu')

/** 計算の種類と、それに要る実行環境の追加機能（抽出の前に、導入済みか確かめるため） */
export async function planBackend(o: ExtractOptions): Promise<{ backend: ExtractorModule.Backend; runtimeAddon: string }> {
  const backend = o.gpu && backendAllowed(o.model, 'webgpu') && (await hasWebGpu()) ? 'webgpu' : 'wasm'
  return { backend, runtimeAddon: RUNTIME_ADDONS[runtimeOf(backend)] }
}

/** 導入した ONNX Runtime の wasm の場所 */
async function wasmUrl(runtime: ExtractorModule.Runtime) {
  const id = RUNTIME_ADDONS[runtime]
  const file = (await installedManifest(id))?.files.find((f) => f.path.endsWith('.wasm'))
  if (!file) throw new Error(`${id} は導入されていません`)
  return addonFileUrl(id, file.path)
}

async function fetchModel(addon: string, stem: ExtractStem) {
  const res = await fetch(addonFileUrl(addon, `${stem}.onnx`))
  if (!res.ok) throw new Error(`${stem}.onnx: HTTP ${res.status}`)
  return res.arrayBuffer()
}

/** 実行環境を作る。`runtime` は読み込む ONNX Runtime（その追加機能が導入済みであること） */
async function open(o: ExtractOptions, backend: ExtractorModule.Backend, runtime: ExtractorModule.Runtime, keepAliveMs?: number) {
  const info = VOCAL_MODELS[o.model]
  const mod = await loadAddon<typeof ExtractorModule>('vocal-extractor')
  return mod.createExtractor({
    vocals: await fetchModel(info.addon, 'vocals'),
    accompaniment: await fetchModel(info.addon, 'accompaniment'),
    backend,
    runtime,
    wasmUrl: await wasmUrl(runtime),
    memoryMb: o.memoryMb,
    keepAliveMs,
  })
}

/**
 * 抽出の実行環境とモデルを読み込む。抽出は数百MB使うので、先に加工と解析の Worker（wasm のメモリ）と、
 * 再生用の音声の複製を手放す（iOS はタブのメモリの上限が低い）。
 * 推論の Worker は続けて抽出する間は使い回す（extractor/src/index.ts）
 */
async function createExtractor(o: ExtractOptions) {
  releaseIdleDsp()
  releasePlayers()
  const backend = o.backend ?? (await planBackend(o)).backend
  // スマホは抽出が終わったらすぐ Worker を止める。残すと、結果のトラックを作る間のメモリと重なって、iOS でタブが落ちた
  const keep = isMobile() ? 0 : undefined
  if (backend === 'wasm') return open(o, 'wasm', 'cpu', keep)
  // WebGPU で作れなければ CPU で作り直す。WebGPU 対応版は CPU でも動くので、入っている版のまま作る
  return open(o, 'webgpu', 'gpu', keep).catch(() => open(o, 'wasm', 'gpu', keep))
}

/** 診断用（debug/diagnoseExtract.ts）: 計算の種類を決めて実行環境を作る。メモリを手放さず、CPU への切り替えもしない */
export const openExtractor = (o: ExtractOptions, backend: ExtractorModule.Backend) => open(o, backend, runtimeOf(backend))

/** 抽出中か（診断で実行環境を作ると、抽出のモデルを入れ替えてしまう） */
let extracting = false
export const isExtracting = () => extracting

/** 実行環境で `f` を行い、終わったら手放す。中断したら Worker ごと止める（処理中の separate は失敗する） */
async function withExtractor<T>(o: ExtractOptions, signal: AbortSignal | undefined, f: (ex: ExtractorModule.Extractor) => Promise<T>) {
  extracting = true
  let extractor: ExtractorModule.Extractor
  try {
    extractor = await createExtractor(o)
  } catch (e) {
    extracting = false
    throw e
  }
  const stop = () => extractor.dispose()
  signal?.addEventListener('abort', stop)
  try {
    return await f(extractor)
  } finally {
    signal?.removeEventListener('abort', stop)
    extractor.dispose()
    extracting = false
  }
}
/** `clip` の範囲（秒）を、取り出したボーカル（または伴奏）に置き換えた音声を返す。長さは変わらない */
export function extractRanges(clip: Clip, ranges: Range[], stem: ExtractStem, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal) {
  return withExtractor(o, signal, async (extractor) => {
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
  })
}

/** `clip` 全体を、ボーカルと伴奏に分ける（推論は1回） */
export function splitBoth(clip: Clip, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal) {
  return withExtractor(o, signal, (extractor) =>
    extractor.separateBoth(clip.channels, clip.sampleRate, { highBand: o.keepHighBand ? 'edge' : 'zeros', onProgress }),
  )
}
