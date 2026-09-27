import { useState, type ReactNode } from 'react'
import { Box, ButtonBase, InputBase, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'

/**
 * インスペクタ（右パネル）の部品。DAW や Unity のインスペクタのように、
 * 折りたためる区切り見出しと「ラベル｜操作」の行を並べる。Web のフォームのような
 * 大きな見出し・カード・余白を使わず、画面の縦を節約する
 */

/** 折りたためる区切り。見出しの右に `extra`（補足の文字など）を置ける */
export function InspectorSection(p: { title: string; extra?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        sx={{ width: '100%', height: 28, px: 1, gap: 0.75, justifyContent: 'flex-start', bgcolor: 'action.hover' }}
      >
        <Box component="span" sx={{ fontSize: 10, width: 10, color: 'text.secondary' }}>
          <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} />
        </Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{p.title}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {p.extra && (
          <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>
            {p.extra}
          </Typography>
        )}
      </ButtonBase>
      {open && <Stack spacing={1} sx={{ px: 1.25, py: 1 }}>{p.children}</Stack>}
    </Box>
  )
}

/** 1行分の設定。左に固定幅のラベル、右に操作を置く（ラベルなしなら操作だけを右側にそろえる） */
export function PropRow(p: { label?: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 26 }}>
      <Typography sx={{ width: 84, flexShrink: 0, fontSize: 12, color: 'text.secondary' }} noWrap>
        {p.label ?? ''}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        {p.children}
      </Stack>
    </Stack>
  )
}

/** 単位付きの小さな数値入力（範囲外の値は丸める） */
export function NumberInput(p: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  unit?: string
  width?: number
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        width: p.width ?? 72,
        flexShrink: 0,
        height: 24,
        px: 0.75,
        border: 1,
        borderColor: 'divider',
        borderRadius: 0.5,
        bgcolor: 'background.default',
        opacity: p.disabled ? 0.5 : 1,
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <InputBase
        type="number"
        value={p.value}
        disabled={p.disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) p.onChange(Math.min(p.max, Math.max(p.min, v)))
        }}
        inputProps={{ min: p.min, max: p.max, step: p.step, 'aria-label': p.ariaLabel }}
        sx={{ flex: 1, fontSize: 12, '& input': { p: 0, textAlign: 'right', MozAppearance: 'textfield' } }}
      />
      {p.unit && <Typography sx={{ fontSize: 11, color: 'text.secondary', ml: 0.5 }}>{p.unit}</Typography>}
    </Stack>
  )
}

/** インスペクタ用の細いスライダーの見た目（目盛りの数字は出さず、行の高さに収める） */
export const COMPACT_SLIDER_SX = {
  flex: 1,
  py: '10px !important',
  '& .MuiSlider-thumb': { width: 12, height: 12 },
  '& .MuiSlider-rail, & .MuiSlider-track': { height: 3 },
} as const
