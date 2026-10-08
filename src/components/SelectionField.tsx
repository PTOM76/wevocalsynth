import { useState } from 'react'
import { Box, ButtonBase, Popover, Stack, TextField, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileExport } from '@fortawesome/free-solid-svg-icons'
import type { Range } from '../audio/types'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'
import { useNumberDraft } from '../hooks/useNumberDraft'
import { pevenFont } from 'pevenmui'

interface Props {
  duration: number
  /** 一番後ろの選択範囲（入力欄で編集するもの）と、選択範囲の数 */
  selection: Range | null
  selectionCount: number
  /** 長さを拍でも出すときの BPM（選択範囲の頭の区間のテンポ。0 なら出さない） */
  bpm?: number
  /** 選択範囲をファイルにする（外へドラッグして書き出す。Chromium 系のパソコンだけ。null なら出さない） */
  dragFile?: () => { name: string; blob: Blob } | null
  /** つまみを押したとき（決めたフォルダーへ保存する） */
  onQuickSave?: () => void
  onSelectionChange: (r: Range | null) => void
  disabled?: boolean
  fontSize?: number
}

/** 開始・終了の秒数の入力欄（打っている途中は空や途中の値でもよい） */
function TimeInput(p: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const field = useNumberDraft(p.value, p.onChange, 0, p.max, (v) => String(+v.toFixed(3)))
  return <TextField size="small" type="number" label={p.label} {...field} slotProps={{ htmlInput: { step: 0.01, min: 0 } }} sx={{ width: 120 }} />
}

/** 外へのドラッグで書き出せるか（DownloadURL は Chromium 系のパソコンのブラウザだけ） */
const canDragOut = () => {
  const data = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[]; mobile: boolean } }).userAgentData
  return !!data && !data.mobile && data.brands.some((b) => b.brand === 'Chromium')
}

/** 選択範囲の表示。クリックすると開始・終了を数値で入力できる（常に入力欄を出して場所を取らないため） */
export default function SelectionField(p: Props) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sel = p.selection
  // 拍は 0.1 拍まで（拍に合わせて切り出すときの目安）
  const beats = sel && p.bpm ? ' / ' + t('selection.beats', { n: Math.round(((sel.end - sel.start) * p.bpm) / 6) / 10 }) : ''

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
        sx={{ px: 1, height: '100%', fontFamily: 'inherit', lineHeight: 'inherit', fontSize: p.fontSize ?? 12, whiteSpace: 'nowrap', '&:hover': { bgcolor: 'action.hover' } }}
      >
        {t('common.selection')}:{' '}
        {sel
          ? `${formatTime(sel.start)}–${formatTime(sel.end)} (${(sel.end - sel.start).toFixed(3)}s${beats})${p.selectionCount > 1 ? ` ×${p.selectionCount}` : ''}`
          : '—'}
      </ButtonBase>
      {sel && p.dragFile && (canDragOut() || p.onQuickSave) && (
        <Tooltip title={t(p.onQuickSave ? (canDragOut() ? 'selection.saveOrDrag' : 'folder.save') : 'selection.dragOut')}>
          <Box
            onClick={p.onQuickSave}
            draggable={canDragOut()}
            onDragStart={(e) => {
              const f = p.dragFile?.()
              if (!f) return e.preventDefault()
              const url = URL.createObjectURL(f.blob)
              // Chrome はこの形式で、ドロップ先のフォルダーにファイルを保存する
              e.dataTransfer.setData('DownloadURL', `audio/wav:${f.name}:${url}`)
              e.dataTransfer.effectAllowed = 'copy'
              setTimeout(() => URL.revokeObjectURL(url), 60_000)
            }}
            // つかみやすいよう、アイコンだけでなく「WAV」の文字も付けて幅を取る
            sx={{ px: 1, mx: 0.25, height: '100%', display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'grab', color: 'text.secondary', border: 1, borderColor: 'divider', borderRadius: 1, fontSize: pevenFont('sm'), '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
          >
            <FontAwesomeIcon icon={faFileExport} fontSize={12} />
            WAV
          </Box>
        </Tooltip>
      )}
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
