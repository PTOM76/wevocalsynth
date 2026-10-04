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
  /** ピッチ帯で曲線を編集していないとき: ↑↓ = 加工のピッチを ±1 半音、Shift+↑↓ = ±12 半音（適用は今どおり） */
  nudgePitch?: (semitones: number) => void
  /** 選択範囲が 2 つ以上のときだけ渡す: Tab / Shift+Tab = 次 / 前の選択範囲を選び、その頭へ移る */
  stepSelection?: (dir: -1 | 1) => void
  /** ← / →: 再生位置を前後に動かす（`fine` は Shift を押しているとき）。Home / End: 先頭・末尾へ */
  seekBy: (dir: -1 | 1, fine: boolean) => void
  seekEdge: (edge: 'start' | 'end') => void
  /** M: 再生位置にマーカーを足す / Ctrl+← →: 前後のマーカーへ */
  addMarker: () => void
  seekMarker: (dir: -1 | 1) => void
}

/**
 * キーボード操作: Space = 再生/一時停止、Ctrl+Z / Ctrl+Y（Ctrl+Shift+Z）= 元に戻す/やり直す、
 * Ctrl+X/C/V = 切り取り/コピー/貼り付け、Ctrl+A / Esc = すべて選択 / 選択解除、
 * ← / → = 再生位置を1拍（拍の線が無ければ1秒、Shift で 0.1 秒）動かす、Home / End = 先頭・末尾へ、
 * ↑ / ↓ = ピッチ（曲線の編集中は曲線、それ以外は加工のピッチ）、Tab / Shift+Tab = 次 / 前の選択範囲へ、
 * Ctrl+O = 開く、Ctrl+S / Ctrl+Shift+S = 保存と書き出し（割り当ては設定）、Ctrl+E = 書き出し。入力欄にフォーカスがあるときは何もしない。
 */
export function useShortcuts(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 入力欄の中や、メニューなどが処理済みのキー（Esc で閉じたときなど）は扱わない。
      // ダイアログ・メニューの中のキーも扱わない（設定画面の矢印キーや Space で、再生やピッチの変更が起きないように）
      if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea, [role="dialog"], [role="menu"]')) return
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
        arrowleft: () => h.seekMarker(-1),
        arrowright: () => h.seekMarker(1),
      }
      const plain: Record<string, (() => void) | undefined> = {
        Space: h.togglePlay,
        Escape: h.clearSelection,
        ArrowLeft: () => h.seekBy(-1, e.shiftKey),
        ArrowRight: () => h.seekBy(1, e.shiftKey),
        Home: () => h.seekEdge('start'),
        End: () => h.seekEdge('end'),
        KeyM: h.addMarker,
      }
      if (h.pitchShift) {
        const step = e.shiftKey ? 0.1 : 1
        const shift = h.pitchShift
        plain.ArrowUp = () => shift(step)
        plain.ArrowDown = () => shift(-step)
      } else if (h.nudgePitch) {
        const step = e.shiftKey ? 12 : 1
        const nudge = h.nudgePitch
        plain.ArrowUp = () => nudge(step)
        plain.ArrowDown = () => nudge(-step)
      }
      if (h.stepSelection) {
        const stepSel = h.stepSelection
        plain.Tab = () => stepSel(e.shiftKey ? -1 : 1)
      }
      // 画面の文字を選んでいるときの Ctrl+C / Ctrl+X は、ブラウザの文字のコピーに任せる
      const sel = window.getSelection()
      if (mod && (k === 'c' || k === 'x') && sel && !sel.isCollapsed) return
      const action = mod ? withMod[k] : plain[e.code]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
