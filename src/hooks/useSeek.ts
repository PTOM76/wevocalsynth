import type { Clip } from '../audio/types'
import { stepBeat, type TempoSegment } from '../audio/tempoMap'

interface Deps {
  /** 今表示しているクリップ（無ければ何もしない） */
  shown: Clip | null
  duration: number
  /** 拍の線を出しているか（設定）と、区間ごとのテンポ */
  showBeatGrid: boolean
  segments: TempoSegment[]
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
    let t: number
    if (fine) t = pos + dir * 0.1
    // 今の位置がちょうど拍の線の上なら、隣の線へ
    else if (d.showBeatGrid && d.segments.length) t = stepBeat(d.segments, pos, dir)
    else t = pos + dir
    d.seek(Math.max(0, Math.min(d.duration, t)))
  }
  /** 先頭・末尾へ */
  const seekEdge = (edge: 'start' | 'end') => {
    if (d.shown) d.seek(edge === 'start' ? 0 : d.duration)
  }
  return { seekBy, seekEdge }
}
