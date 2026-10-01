import { createContext, useContext, type ReactNode } from 'react'
import { Box, Checkbox, FormControlLabel, MenuItem, Select, Switch, Typography } from '@mui/material'
import { useHighlight } from './settingsSearch'

// 設定画面の部品。PC は Windows の設定画面風、スマホは Android の設定画面風にする（NarrowContext で切り替える）

/** スマホ向けの表示か（項目を縦に積み、文字と操作を大きくする） */
export const NarrowContext = createContext(false)

/** 枠線と見出しで項目をまとめる（PC は Windows のグループボックス風、スマホは Android の設定風の見出し） */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  const hit = useHighlight(title)
  if (useContext(NarrowContext))
    return (
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'primary.main', mb: 1, width: 'fit-content', ...hit }}>{title}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
      </Box>
    )
  return (
    <Box component="fieldset" sx={{ m: 0, mb: 2, px: 1.5, pt: 0.5, pb: 1.5, border: 1, borderColor: 'divider', borderRadius: 0.5 }}>
      <Typography component="legend" sx={{ px: 0.5, fontSize: 12, color: 'text.secondary', ...hit }}>
        {title}
      </Typography>
      {/* ラベル列は一番長いラベルに合わせ、入力列は残りの幅に収める（長い選択肢は省略表示） */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 360px)', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
        {children}
      </Box>
    </Box>
  )
}

/** 左にラベル、右に入力欄の1行（スマホはラベルの下に入力欄） */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  const hit = useHighlight(label)
  if (useContext(NarrowContext))
    return (
      <Box>
        <Typography sx={{ fontSize: 14, mb: 0.75, width: 'fit-content', ...hit }}>{label}</Typography>
        {children}
      </Box>
    )
  return (
    <>
      <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap', justifySelf: 'start', ...hit }}>{label}</Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </>
  )
}

export function Choice<T extends string>(p: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  const narrow = useContext(NarrowContext)
  const fontSize = narrow ? 15 : 13
  return (
    <Select size="small" fullWidth value={p.value} onChange={(e) => p.onChange(e.target.value as T)} sx={{ fontSize, minWidth: 0, '& .MuiSelect-select': { py: narrow ? 1.25 : 0.5 } }}>
      {p.options.map(([v, label]) => (
        <MenuItem key={v} value={v} sx={{ fontSize }}>
          {label}
        </MenuItem>
      ))}
    </Select>
  )
}

export function Check(p: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  // 項目名か説明文が検索語に一致したら、項目名に色を付ける
  const hit = useHighlight(p.label, p.help)
  // スマホは Android の設定と同じく、行全体を押せる右寄せのスイッチにする
  if (useContext(NarrowContext))
    return (
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 14, width: 'fit-content', ...hit }}>{p.label}</Typography>
          {p.help && <Typography className="selectable" sx={{ fontSize: 12, color: 'text.secondary' }}>{p.help}</Typography>}
        </Box>
        <Switch checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      </Box>
    )
  return (
    // 幅 0 + 最小幅 100%: 長い説明文で項目名の列が広がらないようにしつつ、行の幅いっぱいで折り返す
    <Box sx={{ gridColumn: '1 / -1', width: 0, minWidth: '100%' }}>
      <FormControlLabel
        control={<Checkbox size="small" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />}
        label={p.label}
        slotProps={{ typography: { sx: { fontSize: 13, ...hit } } }}
      />
      {p.help && <Typography className="selectable" sx={{ fontSize: 11, color: 'text.secondary', ml: 4, mt: -0.5 }}>{p.help}</Typography>}
    </Box>
  )
}
