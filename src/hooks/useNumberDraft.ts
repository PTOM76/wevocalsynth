import { useState } from 'react'

/**
 * 数値の入力欄を、打っている途中の文字のまま扱う。
 * 入力のたびに数値へ直すと、いったん空にする・範囲外の途中（BPM 20〜 の欄で「1」）を経るといった
 * 普通の打ち方ができないため、打っている間は文字を持ち、範囲内の数値になったときだけ反映する。
 * フォーカスを外すか Enter で確定し、範囲外は丸め、空や不正な値は元の値に戻す
 */
export function useNumberDraft(value: number, onCommit: (v: number) => void, min: number, max: number, format: (v: number) => string = String) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)))
    setDraft(null)
  }

  return {
    value: draft ?? format(value),
    onChange: (e: { target: { value: string } }) => {
      const text = e.target.value
      setDraft(text)
      const v = Number(text)
      if (text.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onCommit(v)
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit()
      else if (e.key === 'Escape') setDraft(null)
    },
  }
}
