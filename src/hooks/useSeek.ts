import type { Clip } from '../audio/types'

interface Deps {
  /** 今表示しているクリップ（無ければ何もしない） */
  shown: Clip | null
  duration: number
  /** 拍の線を出しているか（設定）と、プロジェクトのテンポ */
  showBeatGrid: boolean
  bpm: number
  beatOffset: number
  getPosition: () => number
  /** 再生中なら、動かした位置から続けて鳴らす（player.seek） */
  seek: (t: number) => void
}

/** 矢印キー・Home / End での再生位置の移動 */
export function useSeek(d: Deps) {
  /**
   * 再生位置を前後に動かす。拍の線を出していれば前後の拍の線へ、出していなければ1秒。`fine`（Shift）なら 0.1 秒
   */
  const seekBy = (dir: -1 | 1, fine: boolean) => {
    if (!d.shown) return
    const pos = d.getPosition()
    const { showBeatGrid, bpm, beatOffset } = d
    let t: number
    if (fine) t = pos + dir * 0.1
    else if (showBeatGrid && bpm > 0) {
      const beat = 60 / bpm
      const k = (pos - beatOffset) / beat
      // 今の位置がちょうど拍の線の上なら、隣の線へ
      const next = dir > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1
      t = beatOffset + next * beat
    } else t = pos + dir
    d.seek(Math.max(0, Math.min(d.duration, t)))
  }
  /** 先頭・末尾へ */
  const seekEdge = (edge: 'start' | 'end') => {
    if (d.shown) d.seek(edge === 'start' ? 0 : d.duration)
  }
  return { seekBy, seekEdge }
}
