import { useState } from 'react'
import { ButtonBase, Popover, Stack, TextField } from '@mui/material'
import type { Range } from '../audio/types'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'

interface Props {
  duration: number
  /** 一番後ろの選択範囲（入力欄で編集するもの）と、選択範囲の数 */
  selection: Range | null
  selectionCount: number
  onSelectionChange: (r: Range | null) => void
  disabled?: boolean
  fontSize?: number
}

/** 選択範囲の表示。クリックすると開始・終了を数値で入力できる（常に入力欄を出して場所を取らないため） */
export default function SelectionField(p: Props) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sel = p.selection

  const setField = (key: keyof Range, value: string) => {
    const v = Number(value)
    if (!Number.isFinite(v)) return
    const cur = sel ?? { start: 0, end: p.duration }
    const next = { ...cur, [key]: Math.max(0, Math.min(p.duration, v)) }
    p.onSelectionChange(next.end > next.start ? next : null)
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
            <TextField
              key={key}
              size="small"
              type="number"
              label={t(key === 'start' ? 'clip.start' : 'clip.end')}
              value={sel ? +sel[key].toFixed(3) : ''}
              onChange={(e) => setField(key, e.target.value)}
              slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
              sx={{ width: 120 }}
            />
          ))}
        </Stack>
      </Popover>
    </>
  )
}
