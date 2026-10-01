import { useState } from 'react'
import type { Track } from '../../audio/tracks'

/** 押したときの修飾キー（Ctrl / ⌘: 1本ずつ足す・外す、Shift: 範囲で選ぶ） */
export interface PickMods {
  ctrl: boolean
  shift: boolean
}
export const pickMods = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): PickMods => ({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })

/**
 * トラックのドラッグでの並び替え（一覧は縦、タブは横）。`item(i)` を各トラックの要素に広げ、
 * `dropAt` の位置（その番目の前）に差し込む線を出す。離したら `onMove(id, 動かした後の番号)` を呼ぶ
 */
export function useTrackDrag(tracks: Track[], axis: 'x' | 'y', disabled: boolean, onMove: (id: string, to: number) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const end = () => {
    setDragId(null)
    setDropAt(null)
  }

  const item = (i: number) => ({
    draggable: !disabled,
    onDragStart: (e: React.DragEvent) => {
      setDragId(tracks[i].id)
      e.dataTransfer.effectAllowed = 'move'
      // Firefox はデータを入れないとドラッグを始めない
      e.dataTransfer.setData('text/plain', tracks[i].name)
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragId) return
      e.preventDefault()
      // 要素の前半なら前、後半なら後ろに入れる
      const r = e.currentTarget.getBoundingClientRect()
      const after = axis === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
      setDropAt(i + (after ? 1 : 0))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const from = tracks.findIndex((tr) => tr.id === dragId)
      if (dragId && dropAt !== null && from >= 0) onMove(dragId, dropAt > from ? dropAt - 1 : dropAt)
      end()
    },
    onDragEnd: end,
  })

  return { item, dragId, dropAt }
}
