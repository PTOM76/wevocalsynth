import type { DspRequest, DspResponse } from './worker'
import { markActivity, recordDspJob, reportMemory } from '../debug/debugStats'
import { processParallel, shouldSplit } from './parallel'

/** DSPエンジンの時間伸縮方式 */
/** wsola / pv は従来の方式、psola はボーカル向けの新しい方式（Rust 側 `Algorithm::from_id` と対応） */
export type Algorithm = 'wsola' | 'pv' | 'psola' | 'sola' | 'psola2' | 'wsola2' | 'pv2' | 'hpss' | 'sola2' | 'sola3' | 'sms'

// sola2 / sola3 / psola2 / wsola2 / pv2 は改良版（SOLAv2 / SOLAv3 / PSOLAv2 / WSOLAv2 / Phase Vocoder v2）。従来版も残して選べる。hpss は打楽器分離のハイブリッド。sms は試験的な方式（愛称 Specraw。docs/ALGORITHM.md の SMS）
const ALGORITHM_ID: Record<Algorithm, number> = { wsola: 0, pv: 1, psola: 2, sola: 3, psola2: 4, wsola2: 5, pv2: 6, hpss: 7, sola2: 8, sola3: 9, sms: 10 }

type Pending = {
  resolve: (r: Float32Array[] | Uint8Array) => void
  reject: (e: Error) => void
  onProgress?: (p: number) => void
}

/**
 * Worker は2つに分ける。加工（加工・ピッチカーブ・フォルマントと、その試聴）と、解析（F0・スペクトログラム・テンポ）。
 * 1つだと順番待ちになり、ファイルを開いた直後の解析中に「適用」を押すと、解析が終わるまで進捗が 0% のまま止まって見えた
 */
// 'par0'… は、区間に分けて並列に加工するときの Worker（試験的。parallel.ts）
export type Lane = 'edit' | 'analysis' | `par${number}`
const laneOf = (req: DspRequest): Lane => (req.kind === 'f0' || req.kind === 'tempo' || req.kind === 'kana' ? 'analysis' : 'edit')

let nextId = 1
const workers = new Map<Lane, Worker>()
/** 待っている呼び出し。どの Worker に送ったかも持つ（中断で、その Worker の分だけ失敗させる） */
const pending = new Map<number, Pending & { lane: Lane }>()

function getWorker(lane: Lane) {
  let worker = workers.get(lane)
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DspResponse>) => {
      // wasm のメモリの大きさ（デバッグ表示の mem に出す。iOS ではブラウザのメモリ量が見えないため）
      if ('wasmBytes' in e.data) return reportMemory(`wasm ${lane}`, e.data.wasmBytes)
      const p = pending.get(e.data.id)
      if (!p) return
      if ('progress' in e.data) {
        p.onProgress?.(e.data.progress)
        return
      }
      pending.delete(e.data.id)
      if ('error' in e.data) p.reject(new Error(e.data.error))
      else p.resolve(e.data.channels)
    }
    worker.onerror = (e) => failLane(lane, new Error(e.message || 'DSP worker error'))
    workers.set(lane, worker)
  }
  return worker
}

/** `lane` の Worker に送った呼び出しを、すべて `err` で失敗させる */
function failLane(lane: Lane, err: Error) {
  for (const [id, p] of pending) {
    if (p.lane !== lane) continue
    pending.delete(id)
    p.reject(err)
  }
}

// 開発中、このファイルがホットリロードで入れ替わったら古い Worker を止める
// （止めないと WASM のメモリを抱えた Worker が書き換えのたびに増え、タブがメモリ不足で落ちる）
import.meta.hot?.dispose(() => {
  workers.forEach((w) => w.terminate())
  workers.clear()
})

/**
 * 処理していない Worker を止めて、抱えている wasm のメモリを手放す（wasm のメモリは一度増えると縮まない）。
 * メモリをたくさん使う処理（ボーカル抽出）の前に呼ぶ。iOS はタブのメモリの上限が低く、
 * 長い音声を解析した後の Worker が残っていると、抽出で RangeError: out of memory になった。
 * Worker は次のリクエストで作り直される
 */
export function releaseIdleDsp() {
  for (const [lane, worker] of workers) {
    // 解析中でも止める（解析は中断として扱い、通知しない。iOS は wasm のメモリの数にも上限があり、
    // 解析中の Worker が残ると抽出の実行環境を作れなかった）。加工は抽出と重ならないので、処理中なら止めない
    if (lane !== 'analysis' && [...pending.values()].some((p) => p.lane === lane)) continue
    failLane(lane, new DOMException('cancelled', 'AbortError'))
    worker.terminate()
    workers.delete(lane)
    reportMemory(`wasm ${lane}`, 0)
  }
}

/** 中断（`cancelDsp`）で失敗したか。通知せずに済ませるのに使う */
export const isCancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * 加工の処理をすべて中断する（Worker ごと止める。待っている呼び出しは失敗する）。
 * 解析（ピッチ・スペクトログラム・テンポ）は止めない（止めると、表示中の解析が出ないままになる）。
 * Worker は次のリクエストで作り直される（wasm の読み込みに少しかかる）
 */
export function cancelDsp() {
  for (const [lane, worker] of workers) {
    if (lane === 'analysis') continue
    worker.terminate()
    workers.delete(lane)
    reportMemory(`wasm ${lane}`, 0)
    failLane(lane, new DOMException('cancelled', 'AbortError'))
  }
}

/** リクエストを Worker に送り、結果（チャンネル配列）を待つ */
function send(req: DspRequest, onProgress?: (p: number) => void, lane?: Lane): Promise<Float32Array[]> {
  return sendRaw(req, onProgress, lane) as Promise<Float32Array[]>
}

/** `lane` の Worker に送る（区間に分けて並列に加工するとき。parallel.ts） */
export const sendTo = (lane: Lane, req: DspRequest, onProgress?: (p: number) => void) => send(req, onProgress, lane)
export const newId = () => nextId++

function sendRaw(req: DspRequest, onProgress?: (p: number) => void, toLane?: Lane): Promise<Float32Array[] | Uint8Array> {
  const t0 = performance.now()
  markActivity(`dsp ${req.kind}`)
  // デバッグ表示用に、処理の種類と所要時間を記録する
  const done = () => recordDspJob({ kind: req.kind, ms: performance.now() - t0 })
  return new Promise((resolve, reject) => {
    const lane = toLane ?? laneOf(req)
    pending.set(req.id, {
      lane,
      resolve: (v) => {
        done()
        resolve(v)
      },
      reject,
      onProgress,
    })
    const buffers = 'samples' in req ? [req.samples.buffer] : 'channels' in req ? req.channels.map((c) => c.buffer) : []
    if (req.kind === 'curve') buffers.push(req.ratios.buffer)
    getWorker(lane).postMessage(req, buffers)
  })
}

/** F0 の推定間隔（秒）。Rust 側 `f0::HOP_SEC` と一致させる */
export const F0_HOP_SEC = 0.01

/** 全チャンネルを平均したモノラル信号 */
function mixDown(channels: Float32Array[]): Float32Array {
  const len = channels[0]?.length ?? 0
  const samples = new Float32Array(len)
  for (const c of channels) for (let i = 0; i < len; i++) samples[i] += c[i] / channels.length
  return samples
}

/** F0 解析の設定（Rust 側 `f0::Params` と対応） */
export interface F0Params {
  minHz: number
  maxHz: number
  /** 有声とみなす谷の深さの上限（大きいほどゆるい） */
  voicedLimit: number
  /** 無音とみなす音量（RMS） */
  silenceRms: number
}

/** 既定の F0 解析の設定。自動判定・範囲の音程表示はいつもこれを使う */
export const DEFAULT_F0_PARAMS: F0Params = { minHz: 60, maxHz: 1000, voicedLimit: 0.35, silenceRms: 0.003 }

/** 全チャンネルを平均したモノラル信号の F0 を推定する（Hz、無声は 0） */
export async function analyzeF0(channels: Float32Array[], sampleRate: number, params: F0Params = DEFAULT_F0_PARAMS): Promise<Float32Array> {
  const [f0] = await send({ kind: 'f0', id: nextId++, samples: mixDown(channels), sampleRate, f0: params })
  return f0
}

/** テンポの候補。強さは一番強い候補を 1 とした比、`offset` はその BPM での1拍目の位置（秒） */
export interface TempoCandidate {
  bpm: number
  strength: number
  offset: number
}

/** 全チャンネルを平均したモノラル信号のテンポ（BPM）の候補を、強い順に返す */
export async function analyzeTempo(channels: Float32Array[], sampleRate: number): Promise<TempoCandidate[]> {
  const [raw] = await send({ kind: 'tempo', id: nextId++, samples: mixDown(channels), sampleRate })
  const out: TempoCandidate[] = []
  for (let i = 0; i + 2 < raw.length; i += 3) out.push({ bpm: raw[i], strength: raw[i + 1], offset: raw[i + 2] })
  return out
}

/** 声の素材から一音を作る（試験的。dsp/src/kana.rs）の試し: 母音の素材を、元の高さ、4 半音上、7 半音上で作り直して並べる。声のある所がなければ null */
export async function kanaVowelDemo(channels: Float32Array[], sampleRate: number): Promise<Float32Array | null> {
  const [out] = await send({ kind: 'kana', id: nextId++, samples: mixDown(channels), sampleRate })
  return out.length ? out : null
}

/** 和音を 2 つの声に分ける（試作。dsp/src/voices.rs）。`by` が pitch なら A が高い方、volume なら大きい方 */
export async function splitVoices(channels: Float32Array[], sampleRate: number, by: 'pitch' | 'volume', onProgress?: (p: number) => void): Promise<{ a: Float32Array[]; b: Float32Array[] }> {
  const out = await send({ kind: 'voices', id: nextId++, channels: channels.map((c) => c.slice()), sampleRate, by: by === 'volume' ? 1 : 0 }, onProgress)
  const n = out.length / 2
  return { a: out.slice(0, n), b: out.slice(n) }
}

export interface ProcessOptions {
  semitones: number
  stretch: number
  algorithm: Algorithm
  /** ピッチ変更時にフォルマントを保持する */
  preserveFormant: boolean
  /** フォルマントの追加移動量（半音、`preserveFormant` 時のみ有効） */
  formantSemitones: number
}

/** フォルマント補正で速い対数・指数の近似を使うか（設定の開発者向け。処理を頼むたびに Worker へ渡す） */
let fastMath = true

/** フォルマント補正の速い近似を使うかを変える（設定から呼ぶ） */
export function setFastMath(on: boolean) {
  fastMath = on
}

/** プレーナー形式の音声を DSP Worker でピッチ変更・時間伸縮する */
export function processAudio(
  channels: Float32Array[],
  sampleRate: number,
  opts: ProcessOptions,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  const req = { kind: 'process', id: nextId++, channels, sampleRate, ...opts, algorithm: ALGORITHM_ID[opts.algorithm], fastMath } as const
  // 長い音は、区間に分けて並列に加工する（試験的。設定の開発者向け → 試験的機能）
  if (parallel && shouldSplit(channels[0]?.length ?? 0, sampleRate)) return processParallel(req, onProgress)
  return send({ ...req, channels: channels.map((c) => c.slice()) }, onProgress)
}

/** 区間に分けて並列に加工するか（設定。処理を頼むたびに見る） */
let parallel = false
export function setParallel(on: boolean) {
  parallel = on
}

/**
 * ピッチカーブに従って、時間ごとに異なるピッチ変更を行う（長さは変わらない）。
 * `ratios[k]` は時刻 k × `F0_HOP_SEC` のピッチ比。
 */
export function processCurve(
  channels: Float32Array[],
  sampleRate: number,
  ratios: Float32Array,
  opts: Pick<ProcessOptions, 'algorithm' | 'preserveFormant' | 'formantSemitones'>,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  return send(
    {
      kind: 'curve',
      id: nextId++,
      channels: channels.map((c) => c.slice()),
      sampleRate,
      ratios: ratios.slice(),
      hopSamples: F0_HOP_SEC * sampleRate,
      algorithm: ALGORITHM_ID[opts.algorithm],
      preserveFormant: opts.preserveFormant,
      formantSemitones: opts.formantSemitones,
      fastMath,
    },
    onProgress,
  )
}

/** フォルマントだけを、フレームごとの量（`shifts` 半音、`hopSec` 間隔）だけずらす。ピッチと長さは変えない */
export function processFormantCurve(
  channels: Float32Array[],
  sampleRate: number,
  shifts: Float32Array,
  hopSec: number,
  onProgress?: (p: number) => void,
): Promise<Float32Array[]> {
  return send(
    { kind: 'formant', id: nextId++, channels: channels.map((c) => c.slice()), sampleRate, shifts: shifts.slice(), hopSamples: hopSec * sampleRate, fastMath },
    onProgress,
  )
}
