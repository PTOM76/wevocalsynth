import type { Clip, Range } from './types'
import { spliceProcessed } from './edit'
import { normalizeRanges } from './multiRange'
import { addonFileUrl, loadAddon } from '../addons/addons'
import type { VocalModel } from '../settings/settings'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from './usePlayer'
// 型だけ使う（中身は追加機能として後から読み込む）
import type * as ExtractorModule from '../../extractor/src/index'

/**
 * ボーカル抽出の本体（React に依存しない）。画面からの抽出（hooks/useVocalExtract.ts）と、
 * メモリが足りないときに再読み込みしてから行う抽出（project/cleanExtract.ts）の両方で使う
 */

export type ExtractStem = ExtractorModule.Stem

/** モデルの追加機能 ID と、WebGPU で正しく動くか（fp16 は WebGPU で出力がすべて 0 になる。docs/DECISIONS.md） */
export const VOCAL_MODELS: Record<VocalModel, { addon: string; webgpu: boolean }> = {
  fp16: { addon: 'spleeter-fp16', webgpu: false },
  int8: { addon: 'spleeter-int8', webgpu: true },
  fp32: { addon: 'spleeter-fp32', webgpu: true },
}

/** 抽出の設定（設定の「ボーカル抽出」） */
export interface ExtractOptions {
  model: VocalModel
  /** GPU（WebGPU）を使ってよいか */
  gpu: boolean
  /** 約 11kHz より上を残す（モデルが扱わない帯域。残すと伴奏の高い音が混ざりやすい） */
  keepHighBand: boolean
}

/** メモリを手放してから抽出を始めるまでの待ち時間（ミリ秒）。止めた Worker のメモリは、iOS ではすぐには返らない */
const RELEASE_WAIT_MS = 1000

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

async function fetchModel(addon: string, stem: ExtractStem) {
  const res = await fetch(addonFileUrl(addon, `${stem}.onnx`))
  if (!res.ok) throw new Error(`${stem}.onnx: HTTP ${res.status}`)
  return res.arrayBuffer()
}

/**
 * 抽出の実行環境とモデルを読み込む。抽出は数百MB使うので、先に加工・解析の Worker（wasm のメモリ）と、
 * 再生用の音声の複製・AudioContext を手放し、少し待ってから始める（iOS はタブのメモリの上限が低い）
 */
async function createExtractor(o: ExtractOptions) {
  releaseIdleDsp()
  releasePlayers()
  await new Promise((r) => setTimeout(r, RELEASE_WAIT_MS))
  const info = VOCAL_MODELS[o.model]
  const mod = await loadAddon<typeof ExtractorModule>('vocal-extractor')
  const create = async (backend: ExtractorModule.Backend) =>
    mod.createExtractor({ vocals: await fetchModel(info.addon, 'vocals'), accompaniment: await fetchModel(info.addon, 'accompaniment'), backend })
  // WebGPU で作れなければ WASM で作り直す
  if (o.gpu && info.webgpu && (await hasWebGpu())) return create('webgpu').catch(() => create('wasm'))
  return create('wasm')
}

/** 実行環境を作って `f` を行い、終わったら（中断・失敗でも）手放す。中断されたら Worker ごと止める */
async function withExtractor<T>(o: ExtractOptions, signal: AbortSignal | undefined, f: (ex: ExtractorModule.Extractor) => Promise<T>) {
  const extractor = await createExtractor(o)
  const stop = () => extractor.dispose()
  signal?.addEventListener('abort', stop)
  try {
    return await f(extractor)
  } finally {
    signal?.removeEventListener('abort', stop)
    extractor.dispose()
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
