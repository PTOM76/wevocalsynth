import { useEffect, useRef } from 'react'

interface Handlers {
  togglePlay: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
}

/**
 * キーボード操作: Space = 再生/一時停止、Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）= 元に戻す/やり直す、
 * Ctrl+X/C/V = 切り取り/コピー/貼り付け。入力欄にフォーカスがあるときは何もしない。
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
      }
      const action = mod ? withMod[k] : e.code === 'Space' ? h.togglePlay : undefined
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
