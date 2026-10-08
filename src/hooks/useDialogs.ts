import { useCallback, useMemo, useState } from 'react'

/** App が開くダイアログ。足すときはここに名前を足し、AppDialogs.tsx に描画を置く */
export type DialogId = 'shortcuts' | 'settings' | 'about' | 'licenses' | 'history' | 'synth' | 'sampler' | 'silence' | 'record' | 'repeat' | 'soundSelect'

/** ダイアログの開閉をまとめて持つ（ダイアログごとに useState を書かずに済ませる） */
export function useDialogs() {
  const [opened, setOpened] = useState<ReadonlySet<DialogId>>(new Set())
  const set = useCallback((id: DialogId, on: boolean) => {
    setOpened((s) => {
      if (s.has(id) === on) return s
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  return useMemo(
    () => ({
      isOpen: (id: DialogId) => opened.has(id),
      open: (id: DialogId) => set(id, true),
      close: (id: DialogId) => set(id, false),
      /** onClick などに渡す、開く関数 */
      opener: (id: DialogId) => () => set(id, true),
      /** onClose に渡す、閉じる関数 */
      closer: (id: DialogId) => () => set(id, false),
    }),
    [opened, set],
  )
}

export type Dialogs = ReturnType<typeof useDialogs>
