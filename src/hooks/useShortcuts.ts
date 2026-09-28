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
  /** Ctrl+S と Ctrl+Shift+S（どちらが保存でどちらが書き出しかは設定で決まる） */
  save: () => void
  saveAlt: () => void
  exportAudio: () => void
  /** ピッチ帯で曲線を編集できるときだけ渡す: ↑↓ = 半音、Shift+↑↓ = 0.1 半音 */
  pitchShift?: (semitones: number) => void
}

/**
 * キーボード操作: Space = 再生/一時停止、Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）= 元に戻す/やり直す、
 * Ctrl+X/C/V = 切り取り/コピー/貼り付け、Ctrl+A / Esc = すべて選択 / 選択解除、
 * Ctrl+O = 開く、Ctrl+S / Ctrl+Shift+S = 保存と書き出し（割り当ては設定）、Ctrl+E = 書き出し。入力欄にフォーカスがあるときは何もしない。
 */
export function useShortcuts(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 入力欄の中や、メニューなどが処理済みのキー（Esc で閉じたときなど）は扱わない
      if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea')) return
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
        s: e.shiftKey ? h.saveAlt : h.save,
        e: h.exportAudio,
      }
      const plain: Record<string, (() => void) | undefined> = { Space: h.togglePlay, Escape: h.clearSelection }
      if (h.pitchShift) {
        const step = e.shiftKey ? 0.1 : 1
        const shift = h.pitchShift
        plain.ArrowUp = () => shift(step)
        plain.ArrowDown = () => shift(-step)
      }
      const action = mod ? withMod[k] : plain[e.code]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
