// マーカー（追加、名前、テンポ、前後への移動）
import { useState } from 'react'
import type { Marker } from '../project/projectFile'

/** 同じ位置とみなす距離（秒） */
const SAME_SEC = 0.001

/** マーカー（位置に名前付きの目印）。元に戻す履歴には入れない（テンポと同じ） */
export function useMarkers() {
  const [markers, setMarkers] = useState<Marker[]>([])
  const sorted = (list: Marker[]) => [...list].sort((a, b) => a.time - b.time)

  /** `time` より前（dir=-1）・後ろ（1）で一番近いマーカー */
  const neighbor = (time: number, dir: 1 | -1) =>
    dir > 0 ? markers.find((m) => m.time > time + SAME_SEC) : [...markers].reverse().find((m) => m.time < time - SAME_SEC)

  return {
    markers,
    /** ファイルを開いたときに入れ替える */
    reset: (list: Marker[] = []) => setMarkers(sorted(list)),
    /** `time` に足す（同じ位置にあれば足さない）。名前は M1, M2… */
    add: (time: number) =>
      setMarkers((list) => {
        if (list.some((m) => Math.abs(m.time - time) < SAME_SEC)) return list
        let n = list.length + 1
        while (list.some((m) => m.name === `M${n}`)) n++
        return sorted([...list, { id: crypto.randomUUID(), time, name: `M${n}` }])
      }),
    /** テンポを持つマーカーをまとめて足す（自動解析で見つけたテンポの変化）。同じ位置にあればそのマーカーにテンポを持たせる */
    addTempos: (list: { time: number; tempo: NonNullable<Marker['tempo']> }[]) =>
      setMarkers((cur) => {
        let next = cur
        for (const { time, tempo } of list) {
          const same = next.find((m) => Math.abs(m.time - time) < SAME_SEC)
          if (same) {
            next = next.map((m) => (m === same ? { ...m, tempo } : m))
            continue
          }
          let n = next.length + 1
          while (next.some((m) => m.name === `M${n}`)) n++
          next = [...next, { id: crypto.randomUUID(), time, name: `M${n}`, tempo }]
        }
        return sorted(next)
      }),
    remove: (id: string) => setMarkers((list) => list.filter((m) => m.id !== id)),
    /** `id` のマーカーを `time` へ動かす（ドラッグ）。ほかのマーカーと同じ位置でも重ねてよい */
    move: (id: string, time: number) => setMarkers((list) => sorted(list.map((m) => (m.id === id ? { ...m, time } : m)))),
    /** `id` のマーカーに、ここからのテンポを持たせる（undefined で外す） */
    setTempo: (id: string, tempo: Marker['tempo']) => setMarkers((list) => list.map((m) => (m.id === id ? { ...m, tempo } : m))),
    rename: (id: string, name: string) => setMarkers((list) => list.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m))),
    clear: () => setMarkers([]),
    neighbor,
    /** `time` の位置か、それより前で一番近いマーカー（名前の変更・削除の対象） */
    current: (time: number) => [...markers].reverse().find((m) => m.time <= time + SAME_SEC) ?? null,
  }
}
