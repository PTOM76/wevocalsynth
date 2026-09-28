import { formatTime } from '../audio/types'
import { useLivePosition } from '../audio/useLivePosition'

/** 表示を更新する間隔（ミリ秒）。時間の数字が読める速さで十分 */
const UPDATE_MS = 100

/** 「再生位置 / 長さ」の表示。再生中はこの部品だけが自分で更新する */
export default function LiveTime(p: { position: number; playing: boolean; livePosition: () => number; duration: number }) {
  const t = useLivePosition(p.position, p.playing, p.livePosition, UPDATE_MS)
  return (
    <>
      {formatTime(t)} / {formatTime(p.duration)}
    </>
  )
}
