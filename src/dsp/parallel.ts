import { isMobile } from 'pevenmui/web'
import type { ProcessRequest } from './worker'
import { newId, sendTo } from './engine'

/**
 * 区間に分けて並列に加工する（試験的。設定の開発者向け → 試験的機能。dsp/src/segment.rs）。
 * 区間の割り当てとつなぎは wasm（segment.rs）で行い、区間ごとの加工を複数の Worker に配る。
 * 今はピッチと長さが一定の加工（processAudio）だけを分ける
 */

/** これより短い音は分けない（秒。segment.rs の `MIN_SPLIT_SEC` と同じ） */
const MIN_SPLIT_SEC = 20

export const shouldSplit = (frames: number, sampleRate: number) => frames >= MIN_SPLIT_SEC * sampleRate

/** 並列に使う Worker の数: CPU のコアの数 − 1（画面と再生に 1 つ残す）、最大 8。スマホはメモリのため最大 3 */
const workerCount = () => Math.max(2, Math.min(isMobile() ? 3 : 8, (navigator.hardwareConcurrency || 4) - 1))

export async function processParallel(req: ProcessRequest, onProgress?: (p: number) => void): Promise<Float32Array[]> {
  const frames = req.channels[0].length
  const [raw] = await sendTo('edit', { kind: 'segplan', id: newId(), frames, sampleRate: req.sampleRate })
  // 区間の境界は Float64 で返ってくる（worker.ts）
  const plan = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8)
  const count = plan.length / 4
  const done = new Float64Array(count)
  // つなぐ処理の分を 5% 残す
  const report = () => onProgress?.((0.95 * done.reduce((a, b) => a + b, 0)) / count)
  const outs: Float32Array[][] = new Array(count)
  let next = 0
  // 終わった Worker が次の区間を取る
  const lanes = Array.from({ length: Math.min(workerCount(), count) }, (_, i) => `par${i}` as const)
  await Promise.all(
    lanes.map(async (lane) => {
      while (next < count) {
        const k = next++
        const [ctxStart, ctxEnd] = [plan[k * 4 + 2], plan[k * 4 + 3]]
        const part = req.channels.map((c) => c.slice(ctxStart, ctxEnd))
        outs[k] = await sendTo(lane, { ...req, id: newId(), channels: part }, (p) => {
          done[k] = p
          report()
        })
        done[k] = 1
        report()
      }
    }),
  )
  const result = await sendTo('edit', { kind: 'stitch', id: newId(), channels: outs.flat(), frames, channelCount: req.channels.length, sampleRate: req.sampleRate, stretch: req.stretch })
  onProgress?.(1)
  return result
}
