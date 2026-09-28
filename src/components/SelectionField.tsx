import { useState } from 'react'
import { ButtonBase, Popover, Stack, TextField } from '@mui/material'
import type { Range } from '../audio/types'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'
import { useNumberDraft } from '../hooks/useNumberDraft'

interface Props {
  duration: number
  /** 一番後ろの選択範囲（入力欄で編集するもの）と、選択範囲の数 */
  selection: Range | null
  selectionCount: number
  onSelectionChange: (r: Range | null) => void
  disabled?: boolean
  fontSize?: number
}

/** 開始・終了の秒数の入力欄（打っている途中は空や途中の値でもよい） */
function TimeInput(p: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const field = useNumberDraft(p.value, p.onChange, 0, p.max, (v) => String(+v.toFixed(3)))
  return <TextField size="small" type="number" label={p.label} {...field} slotProps={{ htmlInput: { step: 0.01, min: 0 } }} sx={{ width: 120 }} />
}

/** 選択範囲の表示。クリックすると開始・終了を数値で入力できる（常に入力欄を出して場所を取らないため） */
export default function SelectionField(p: Props) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sel = p.selection

  const setField = (key: keyof Range, v: number) => {
    const cur = sel ?? { start: 0, end: p.duration }
    const next = { ...cur, [key]: v }
    // 開始と終了が逆になる途中の値では、範囲を消さずに待つ
    if (next.end > next.start) p.onSelectionChange(next)
  }

  return (
    <>
      <ButtonBase
        disabled={p.disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ px: 1, height: '100%', fontSize: p.fontSize ?? 12, whiteSpace: 'nowrap', '&:hover': { bgcolor: 'action.hover' } }}
      >
        {t('common.selection')}:{' '}
        {sel
          ? `${formatTime(sel.start)}–${formatTime(sel.end)} (${(sel.end - sel.start).toFixed(3)}s)${p.selectionCount > 1 ? ` ×${p.selectionCount}` : ''}`
          : '—'}
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack direction="row" spacing={1} sx={{ p: 1.5 }}>
          {(['start', 'end'] as const).map((key) => (
            <TimeInput
              key={key}
              label={t(key === 'start' ? 'clip.start' : 'clip.end')}
              value={sel ? sel[key] : key === 'start' ? 0 : p.duration}
              max={p.duration}
              onChange={(v) => setField(key, v)}
            />
          ))}
        </Stack>
      </Popover>
    </>
  )
}
