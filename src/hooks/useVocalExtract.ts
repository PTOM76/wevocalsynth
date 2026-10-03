import type { Clip, Range } from '../audio/types'
import { spliceProcessed } from '../audio/edit'
import { normalizeRanges } from '../audio/multiRange'
import { addonFileUrl, loadAddon } from '../addons/addons'
import type { VocalModel } from '../settings/settings'
import type { Track } from '../audio/tracks'
import { t } from '../i18n/i18n'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from '../audio/usePlayer'

/** メモリを手放してから抽出を始めるまでの待ち時間（ミリ秒）。止めた Worker のメモリは、iOS ではすぐには返らない */
const RELEASE_WAIT_MS = 1000
// 型だけ使う（中身は追加機能として後から読み込む）
import type * as ExtractorModule from '../../extractor/src/index'

export type ExtractStem = ExtractorModule.Stem

/** モデルの追加機能 ID と、WebGPU で正しく動くか（fp16 は WebGPU で出力がすべて 0 になる。docs/DECISIONS.md） */
export const VOCAL_MODELS: Record<VocalModel, { addon: string; webgpu: boolean }> = {
  fp16: { addon: 'spleeter-fp16', webgpu: false },
  int8: { addon: 'spleeter-int8', webgpu: true },
  fp32: { addon: 'spleeter-fp32', webgpu: true },
}

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

interface Deps {
  edited: Clip | null
  /** 対象（選択範囲、なければ全体） */
  editRanges: Range[]
  model: VocalModel
  /** GPU（WebGPU）を使ってよいか */
  gpu: boolean
  /** 約 11kHz より上を残す（モデルが扱わない帯域。残すと伴奏の高い音が混ざりやすい） */
  keepHighBand: boolean
  /** 追加機能が導入済みか確かめ、なければ導入の確認ダイアログを出す */
  ensure: (id: string) => Promise<boolean>
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
}

/**
 * ボーカル抽出（追加機能）。対象の範囲を、取り出したボーカル（または伴奏）に置き換えて履歴に積む。
 * 長さは変わらない。モデルは抽出のたびに読み込み、終わったら解放する（推論中は数百MB使うため、スマホでメモリを持ち続けない）
 */
export function useVocalExtract(d: Deps) {
  const createExtractor = async (model: VocalModel, gpu: boolean) => {
    // 抽出は数百MB使うので、先に加工・解析の Worker（wasm のメモリ）と、再生用の音声の複製・AudioContext を手放す。
    // iOS はタブのメモリの上限が低く、手放さないと RangeError: out of memory や no available backend found（実行環境を作れない）になった。
    // Worker を止めてもメモリはすぐには返らないので、少し待ってから始める
    releaseIdleDsp()
    releasePlayers()
    await new Promise((r) => setTimeout(r, RELEASE_WAIT_MS))
    const info = VOCAL_MODELS[model]
    const mod = await loadAddon<typeof ExtractorModule>('vocal-extractor')
    const create = async (backend: ExtractorModule.Backend) =>
      mod.createExtractor({ vocals: await fetchModel(info.addon, 'vocals'), accompaniment: await fetchModel(info.addon, 'accompaniment'), backend })
    // WebGPU で作れなければ WASM で作り直す
    if (gpu && info.webgpu && (await hasWebGpu())) return create('webgpu').catch(() => create('wasm'))
    return create('wasm')
  }

  /** メモリ不足で失敗したら、どうすればよいかを伝える文言に置き換える */
  const explainMemoryError = (e: unknown): never => {
    if (/out of memory|no available backend/i.test(String(e))) throw new Error(t('extract.outOfMemory'))
    throw e
  }

  const extract = async (stem: ExtractStem) => {
    const { edited, editRanges } = d
    if (!edited || !editRanges.length) return
    // 導入の確認ダイアログは、処理中の表示より先に出す
    if (!(await d.ensure(VOCAL_MODELS[d.model].addon))) return
    await d.run(t(stem === 'vocals' ? 'task.extractVocals' : 'task.extractAccompaniment'), async (signal) => {
      const ranges = normalizeRanges(editRanges)
      const sr = edited.sampleRate
      const len = edited.channels[0].length
      let cur = edited
      const extractor = await createExtractor(d.model, d.gpu).catch(explainMemoryError)
      // 中断されたら Worker ごと止める（処理中の separate は失敗する）
      const stop = () => extractor.dispose()
      signal.addEventListener('abort', stop)
      try {
        for (const [i, r] of ranges.entries()) {
          const s = Math.max(0, Math.min(len, Math.round(r.start * sr)))
          const e = Math.max(s, Math.min(len, Math.round(r.end * sr)))
          if (e - s < 1) continue
          const channels = await extractor
            .separate(
            cur.channels.map((c) => c.subarray(s, e)),
            sr,
            { stem, highBand: d.keepHighBand ? 'edge' : 'zeros', onProgress: (p) => d.setProgress((i + p) / ranges.length) },
            )
            .catch(explainMemoryError)
          // 長さは変わらないので、前の範囲の位置はずれない
          cur = spliceProcessed(cur, { s, e, channels }).clip
        }
      } finally {
        signal.removeEventListener('abort', stop)
        extractor.dispose()
      }
      if (signal.aborted) return
      d.commit(cur, t(stem === 'vocals' ? 'extract.vocals' : 'extract.accompaniment'))
      if (stem === 'vocals') d.onVocals()
      d.notify(t('toast.extracted'))
    })
  }

  /** トラック `id`（既定は選んでいるもの）全体を、ボーカルと伴奏の2つのトラックに分ける（推論は1回） */
  const splitStems = async (id = d.activeId) => {
    const track = d.tracks.find((tr) => tr.id === id)
    if (!track) return
    const edited = track.clip
    if (!(await d.ensure(VOCAL_MODELS[d.model].addon))) return
    await d.run(t('task.splitStems'), async (signal) => {
      const extractor = await createExtractor(d.model, d.gpu).catch(explainMemoryError)
      const stop = () => extractor.dispose()
      signal.addEventListener('abort', stop)
      let r: { vocals: Float32Array[]; accompaniment: Float32Array[] }
      try {
        r = await extractor
          .separateBoth(edited.channels, edited.sampleRate, {
            highBand: d.keepHighBand ? 'edge' : 'zeros',
            onProgress: d.setProgress,
          })
          .catch(explainMemoryError)
      } finally {
        signal.removeEventListener('abort', stop)
        extractor.dispose()
      }
      if (signal.aborted) return
      const sr = edited.sampleRate
      d.split(
        [
          { name: t('track.vocalsName', { name: track.name }), clip: { sampleRate: sr, channels: r.vocals } },
          { name: t('track.accompanimentName', { name: track.name }), clip: { sampleRate: sr, channels: r.accompaniment } },
        ],
        t('extract.split'),
        id,
      )
      d.onVocals()
      d.notify(t('toast.extracted'))
    })
  }

  return { extract, splitStems }
}
