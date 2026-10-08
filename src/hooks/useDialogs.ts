// ダイアログの開閉と、開くときに渡す値
import { useCallback, useMemo, useState } from 'react'

/** App が開くダイアログ。足すときはここに名前を足し、AppDialogs.tsx に描画を置く */
export type DialogId =
  | 'shortcuts' | 'settings' | 'about' | 'licenses' | 'history' | 'synth' | 'sampler' | 'silence' | 'record' | 'repeat' | 'soundSelect' | 'eq' | 'tempoChange' | 'kanaCut'
  // 値を渡して開くもの: マーカーの名前の変更とテンポ（マーカーの id）、ピッチの一括操作（'snap' | 'vibrato' | 'midi'）
  | 'renameMarker' | 'markerTempo' | 'pitchTool'

/** 開いているダイアログと、開くときに渡した値（値のないものは true） */
type Opened = ReadonlyMap<DialogId, unknown>

/** ダイアログの開閉をまとめて持つ（ダイアログごとに useState を書かずに済ませる） */
export function useDialogs() {
  const [opened, setOpened] = useState<Opened>(new Map())
  // 開いた回数（設定を開いたまま、もう一度開いたら、別の窓の設定画面を手前に出す合図に使う）
  const [counts, setCounts] = useState<ReadonlyMap<DialogId, number>>(new Map())
  const open = useCallback((id: DialogId, arg: unknown = true) => {
    setOpened((m) => new Map(m).set(id, arg))
    setCounts((m) => new Map(m).set(id, (m.get(id) ?? 0) + 1))
  }, [])
  const close = useCallback((id: DialogId) => {
    setOpened((m) => {
      if (!m.has(id)) return m
      const next = new Map(m)
      next.delete(id)
      return next
    })
  }, [])
  return useMemo(
    () => ({
      isOpen: (id: DialogId) => opened.has(id),
      /** 開くときに渡した値（開いていなければ null） */
      arg: <T>(id: DialogId) => (opened.has(id) ? (opened.get(id) as T) : null),
      openCount: (id: DialogId) => counts.get(id) ?? 0,
      open,
      close,
      /** onClick などに渡す、開く関数 */
      opener: (id: DialogId) => () => open(id),
      /** onClose に渡す、閉じる関数 */
      closer: (id: DialogId) => () => close(id),
    }),
    [opened, counts, open, close],
  )
}

export type Dialogs = ReturnType<typeof useDialogs>
