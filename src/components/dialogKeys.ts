/**
 * ダイアログの Enter で、主のボタン（OK・作成・書き出しなど）を押す（Windows のダイアログと同じ）。
 * Esc で閉じるのは MUI の Dialog の onClose が受け持つ。
 * ボタン・選択欄・ラジオなど、Enter に自分の意味がある要素にフォーカスがあるときは何もしない
 * （Tab でボタンに移って Enter なら、そのボタンが押される）。`data-no-submit` を付けた欄（検索欄など）も除く。日本語の変換を確定する Enter も無視する
 */
export function enterToSubmit(onOk: () => void, enabled = true) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey || e.ctrlKey || e.altKey || !enabled) return
    const el = e.target as HTMLElement
    if (el.closest('button, a, textarea, [role="button"], [role="combobox"], [role="listbox"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="slider"], [role="tab"], input[type="checkbox"], input[type="radio"], [data-no-submit]')) return
    e.preventDefault()
    onOk()
  }
}
