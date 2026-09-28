import { useEffect, useState } from 'react'

/**
 * 再生中の今の位置を、この部品の中だけで `intervalMs` ごとに読む。
 * 再生位置を画面全体の状態で持つと、再生中ずっと画面全体が描き直されて重くなるため、
 * 時間表示などの小さな部品だけがこれを使って自分を描き直す
 */
export function useLivePosition(position: number, playing: boolean, livePosition: () => number, intervalMs: number): number {
  const [live, setLive] = useState(position)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setLive(livePosition()), intervalMs)
    return () => clearInterval(timer)
  }, [playing, livePosition, intervalMs])
  return playing ? live : position
}
