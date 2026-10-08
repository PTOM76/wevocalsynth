// ボーカル抽出の本体（モデルの選択と実行環境。React に依存しない）
import type { Clip, Range } from './types'
import { spliceProcessed } from './edit'
import { normalizeRanges } from './multiRange'
import { addonFileUrl, installedManifest, loadAddon } from '../addons/addons'
import type { StemModel, VocalModel } from '../settings/settings'
import type { MessageKey } from '../i18n/i18n'
import { backendAllowed, effectiveModel } from '../../extractor/src/compat'
import { MDX_MODELS, type MdxModelId } from '../../extractor/src/mdxModels'
import { DEMUCS_MODELS, type DemucsModelId } from '../../extractor/src/demucsModels'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from './usePlayer'
import { isMobile } from 'pevenmui/web'
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
export const VOCAL_MODELS: Record<VocalModel, { addon: string; label: MessageKey; mdx?: MdxModelId; lead?: true }> = {
  fp16: { addon: 'spleeter-fp16', label: 'addon.modelLight' },
  int8: { addon: 'spleeter-int8', label: 'addon.modelStandard' },
  fp32: { addon: 'spleeter-fp32', label: 'addon.modelPrecise' },
  'voc-ft': { addon: 'uvr-mdx-voc-ft', label: 'addon.modelVocalHq', mdx: 'voc-ft' },
  'inst-hq4': { addon: 'uvr-mdx-inst-hq4', label: 'addon.modelInstHq', mdx: 'inst-hq4' },
  // 主旋律とハモリを分ける（`splitLead` で、取り出したボーカルに掛ける）。抽出のモデルとしては選べない
  kara2: { addon: 'uvr-mdx-kara2', label: 'addon.modelLead', mdx: 'kara2', lead: true },
}

/** 楽器ごとに分けるモデルの追加機能 ID と、表示する名前 */
export const STEM_MODELS: Record<StemModel, { addon: string; label: MessageKey; demucs: DemucsModelId }> = {
  htdemucs: { addon: 'demucs-4', label: 'addon.modelStems4', demucs: 'htdemucs' },
  htdemucs6s: { addon: 'demucs-6', label: 'addon.modelStems6', demucs: 'htdemucs6s' },
}

/** 主旋律とハモリを分けるモデル */
export const LEAD_MODEL: VocalModel = 'kara2'

/** 抽出のモデルとして選べるもの（主旋律モデルは除く） */
export const EXTRACT_MODELS = (Object.keys(VOCAL_MODELS) as VocalModel[]).filter((m) => !VOCAL_MODELS[m].lead)

/** UVR の MDX-Net か（CPU では曲の長さの約 10 倍かかる。extractor/docs/MODELS.md） */
export const isMdxModel = (model: VocalModel) => !!VOCAL_MODELS[model].mdx

/** この端末で実際に使うモデル（非互換なら代わりのもの）と、替えたか */
export function resolveModel(model: VocalModel, gpu: boolean): { model: VocalModel; replaced: boolean } {
  const r = effectiveModel(model, { gpu }, Object.keys(VOCAL_MODELS))
  return { model: r.model as VocalModel, replaced: r.reason !== null }
}

/** 抽出の設定（設定の「ボーカル抽出」） */
export interface ExtractOptions {
  model: VocalModel
  /** 楽器ごとに分けるときのモデル（あれば `model` の代わりに使う） */
  stemModel?: StemModel
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
  const backend = o.gpu && backendAllowed(o.stemModel ?? o.model, 'webgpu') && (await hasWebGpu()) ? 'webgpu' : 'wasm'
  return { backend, runtimeAddon: RUNTIME_ADDONS[runtimeOf(backend)] }
}

/** 導入した ONNX Runtime の wasm の場所 */
async function wasmUrl(runtime: ExtractorModule.Runtime) {
  const id = RUNTIME_ADDONS[runtime]
  const file = (await installedManifest(id))?.files.find((f) => f.path.endsWith('.wasm'))
  if (!file) throw new Error(`${id} は導入されていません`)
  return addonFileUrl(id, file.path)
}

async function fetchModel(addon: string, file: ExtractStem | 'model') {
  const res = await fetch(addonFileUrl(addon, `${file}.onnx`))
  if (!res.ok) throw new Error(`${file}.onnx: HTTP ${res.status}`)
  return res.arrayBuffer()
}

/**
 * 追加機能の model.onnx を読み込む。配信先（GitHub Pages）は 1 ファイル 100MB までなので、大きいモデルは
 * model.onnx.000、.001… に分けて置いてあり、つなげて返す（scripts/build-addons.mjs）
 */
async function fetchJoined(addon: string) {
  const parts = (await installedManifest(addon))?.files.map((f) => f.path).filter((p) => /^model\.onnx\.\d+$/.test(p)).sort() ?? []
  if (!parts.length) return fetchModel(addon, 'model')
  const bufs: ArrayBuffer[] = []
  for (const p of parts) {
    const res = await fetch(addonFileUrl(addon, p))
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`)
    bufs.push(await res.arrayBuffer())
  }
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0))
  let at = 0
  for (const b of bufs.splice(0)) {
    out.set(new Uint8Array(b), at)
    at += b.byteLength
  }
  return out.buffer
}

/** WebGPU のデバイスが失われたときに呼ぶ（画面がブラウザの再起動を勧める。`setGpuLostHandler`） */
let gpuLostHandler: ((message: string) => void) | undefined
export const setGpuLostHandler = (f: ((message: string) => void) | undefined) => {
  gpuLostHandler = f
}

/** GPU で処理できなかったときに、CPU で続けるかを尋ねる（`reason` は理由。偽なら中断）。渡さなければ尋ねずに CPU に切り替える */
export type ConfirmCpu = (reason: string) => Promise<boolean>

async function open(o: ExtractOptions, backend: ExtractorModule.Backend, runtime: ExtractorModule.Runtime, keepAliveMs?: number, confirmCpu?: ConfirmCpu) {
  const info = VOCAL_MODELS[o.model]
  const mod = await loadAddon<typeof ExtractorModule>('vocal-extractor')
  // Spleeter はボーカル用・伴奏用の 2 つ、MDX-Net と Demucs は model.onnx の 1 つ
  const stem = o.stemModel && STEM_MODELS[o.stemModel]
  const model = stem
    ? { demucs: { model: await fetchJoined(stem.addon), params: DEMUCS_MODELS[stem.demucs].params } }
    : info.mdx
      ? { mdx: { model: await fetchModel(info.addon, 'model'), params: MDX_MODELS[info.mdx].params } }
      : { vocals: await fetchModel(info.addon, 'vocals'), accompaniment: await fetchModel(info.addon, 'accompaniment') }
  return mod.createExtractor({
    ...model,
    backend,
    runtime,
    wasmUrl: await wasmUrl(runtime),
    memoryMb: o.memoryMb,
    keepAliveMs,
    onGpuFallback: backend === 'webgpu' ? confirmCpu : undefined,
    onGpuDeviceLost: (message) => gpuLostHandler?.(message),
  })
}

/**
 * 抽出の実行環境とモデルを読み込む。抽出は数百MB使うので、先に加工と解析の Worker（wasm のメモリ）と、
 * 再生用の音声の複製を手放す（iOS はタブのメモリの上限が低い）。
 * 推論の Worker は続けて抽出する間は使い回す（extractor/src/index.ts）
 */
async function createExtractor(o: ExtractOptions, confirmCpu?: ConfirmCpu) {
  releaseIdleDsp()
  releasePlayers()
  const backend = o.backend ?? (await planBackend(o)).backend
  // スマホは抽出が終わったらすぐ Worker を止める。残すと、結果のトラックを作る間のメモリと重なって、iOS でタブが落ちた
  const keep = isMobile() ? 0 : undefined
  if (backend === 'wasm') return open(o, 'wasm', 'cpu', keep)
  // WebGPU で作れなければ、確かめてから CPU で作り直す。WebGPU 対応版は CPU でも動くので、入っている版のまま作る
  return open(o, 'webgpu', 'gpu', keep, confirmCpu).catch(async (e: unknown) => {
    if (confirmCpu && !(await confirmCpu(String(e)))) throw new DOMException('cancelled', 'AbortError')
    return open(o, 'wasm', 'gpu', keep)
  })
}

/** 診断用（debug/diagnoseExtract.ts）: 計算の種類を決めて実行環境を作る。メモリを手放さず、CPU への切り替えもしない */
export const openExtractor = (o: ExtractOptions, backend: ExtractorModule.Backend) => open(o, backend, runtimeOf(backend))

/** 抽出中か（診断で実行環境を作ると、抽出のモデルを入れ替えてしまう） */
let extracting = false
export const isExtracting = () => extracting

/** 実行環境で `f` を行い、終わったら手放す。中断したら Worker ごと止める（処理中の separate は失敗する） */
async function withExtractor<T>(o: ExtractOptions, signal: AbortSignal | undefined, f: (ex: ExtractorModule.Extractor) => Promise<T>, confirmCpu?: ConfirmCpu) {
  extracting = true
  let extractor: ExtractorModule.Extractor
  try {
    extractor = await createExtractor(o, confirmCpu)
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
export function extractRanges(
  clip: Clip,
  ranges: Range[],
  stem: ExtractStem,
  o: ExtractOptions,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
  confirmCpu?: ConfirmCpu,
) {
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
  }, confirmCpu)
}

/** `clip` 全体を、ボーカルと伴奏に分ける（推論は1回） */
export function splitBoth(clip: Clip, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) {
  return withExtractor(
    o,
    signal,
    (extractor) => extractor.separateBoth(clip.channels, clip.sampleRate, { highBand: o.keepHighBand ? 'edge' : 'zeros', onProgress }),
    confirmCpu,
  )
}

/**
 * `clip` 全体を、主旋律、ハモリ、伴奏に分ける。`o` のモデルでボーカルと伴奏に分け、
 * そのボーカルを主旋律モデル（UVR Karaoke 2。主旋律以外を取り出す）で主旋律とハモリに分ける（推論は 2 回）
 */
export async function splitLead(clip: Clip, o: ExtractOptions, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) {
  const first = await splitBoth(clip, o, (p) => onProgress(p / 2), signal, confirmCpu)
  if (signal?.aborted) throw new DOMException('cancelled', 'AbortError')
  const lead: ExtractOptions = { ...o, model: LEAD_MODEL, backend: undefined }
  const second = await splitBoth({ sampleRate: clip.sampleRate, channels: first.vocals }, lead, (p) => onProgress(0.5 + p / 2), signal, confirmCpu)
  return { lead: second.vocals, harmony: second.accompaniment, accompaniment: first.accompaniment }
}

/** 楽器ごとに分けた音（モデルが出す音ごと。`lead` と `harmony` は、ボーカルをさらに分けたとき） */
export type InstrumentStems = Partial<Record<ExtractorModule.DemucsSource | 'lead' | 'harmony', Float32Array[]>>

/**
 * `clip` 全体を、`o.stemModel` のモデル（Demucs）で楽器ごとに分ける。`chorus` なら、ボーカルをさらに
 * 主旋律モデル（UVR Karaoke 2）で主旋律とハモリに分ける（推論は 2 回。Demucs の方がずっと長いので、進み具合は 9 割を当てる）
 */
export async function splitInstruments(clip: Clip, o: ExtractOptions, chorus: boolean, onProgress: (p: number) => void, signal?: AbortSignal, confirmCpu?: ConfirmCpu) {
  if (!o.stemModel) throw new Error('stemModel is required')
  const sources = DEMUCS_MODELS[STEM_MODELS[o.stemModel].demucs].params.sources
  const share = chorus ? 0.9 : 1
  const outs = await withExtractor(o, signal, (ex) => ex.separateStems(clip.channels, clip.sampleRate, [...sources], { onProgress: (p) => onProgress(p * share) }), confirmCpu)
  const r: InstrumentStems = Object.fromEntries(sources.map((s, i) => [s, outs[i]]))
  if (!chorus || !r.vocals) return r
  if (signal?.aborted) throw new DOMException('cancelled', 'AbortError')
  const lead: ExtractOptions = { ...o, model: LEAD_MODEL, stemModel: undefined, backend: undefined }
  const second = await splitBoth({ sampleRate: clip.sampleRate, channels: r.vocals }, lead, (p) => onProgress(share + p * (1 - share)), signal, confirmCpu)
  return { ...r, vocals: undefined, lead: second.vocals, harmony: second.accompaniment }
}
