import type * as Analyzer from '../../analyzer/src/index'
import { loadAddon } from '../addons/addons'
import type { Clip } from './types'

/**
 * スペクトログラム。計算と画像にするのは追加機能「解析」（analyzer/ の WeVocalAnalyzer）が行う（docs/DECISIONS.md）。
 * 使う前に導入を確かめる（useEditor の `ensure('analyzer')`）
 */
export type { Spectrogram } from '../../analyzer/src/index'

let mod: typeof Analyzer | null = null

/** 全チャンネルを平均したスペクトログラム（Worker で計算する） */
export async function analyzeSpectrogram(clip: Clip) {
  mod ??= await loadAddon<typeof Analyzer>('analyzer')
  return mod.analyzeSpectrogram(clip)
}

/** 表示範囲を width × height の画像にする。結果（`analyzeSpectrogram`）があるときは追加機能を読み込み済み */
export const renderSpectrogram: typeof Analyzer.renderSpectrogram = (...args) => mod!.renderSpectrogram(...args)
