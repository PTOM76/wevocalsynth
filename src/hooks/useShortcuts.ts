import { useEffect, useRef } from 'react'

interface Handlers {
  togglePlay: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  selectAll: () => void
  clearSelection: () => void
  open: () => void
  save: () => void
  exportAudio: () => void
}

/**
 * キーボード操作: Space = 再生/一時停止、Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）= 元に戻す/やり直す、
 * Ctrl+X/C/V = 切り取り/コピー/貼り付け、Ctrl+A / Esc = すべて選択 / 選択解除、
 * Ctrl+O / Ctrl+S / Ctrl+E = 開く / 保存 / 書き出し。入力欄にフォーカスがあるときは何もしない。
 */
export function useShortcuts(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const h = ref.current
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const withMod: Record<string, () => void> = {
        x: h.cut,
        c: h.copy,
        v: h.paste,
        z: e.shiftKey ? h.redo : h.undo,
        y: h.redo,
        a: h.selectAll,
        o: h.open,
        s: h.save,
        e: h.exportAudio,
      }
      const plain: Record<string, () => void> = { Space: h.togglePlay, Escape: h.clearSelection }
      const action = mod ? withMod[k] : plain[e.code]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
