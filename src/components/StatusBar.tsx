import { Box, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import type { Clip, Range } from '../audio/types'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'
import type { ReactNode } from 'react'
import SelectionField from './SelectionField'

export type Source = 'edited' | 'original'

interface Props {
  fileName: string
  clip: Clip | null
  duration: number
  /** 一番後ろの選択範囲（入力欄で編集するもの）と、選択範囲の数 */
  selection: Range | null
  selectionCount: number
  onSelectionChange: (r: Range | null) => void
  busy: boolean
  progress: number
  /** 処理中の内容（「音声加工中…」など） */
  taskLabel: string
  source: Source
  onSourceChange: (s: Source) => void
  /** BPM の表示（押すとテンポのパネル） */
  tempo: ReactNode
}

const ITEM_SX = { px: 1, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' } as const

/**
 * PC 用のステータスバー（高さ 24px）。ファイルの情報、選択範囲（クリックで数値入力）、
 * 処理中の進捗、加工後／原音の切替を並べる。常に見えていてほしいが、場所は取りたくない情報を置く
 */
export default function StatusBar(p: Props) {
  const t = useT()
  return (
    <Stack
      direction="row"
      sx={{ height: 24, fontSize: 12, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', alignItems: 'center' }}
    >
      <Box className="selectable" sx={{ ...ITEM_SX, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', lineHeight: '24px' }}>
        {p.fileName || '—'}
      </Box>
      {p.clip && (
        <Box sx={{ ...ITEM_SX, color: 'text.secondary' }}>
          {p.clip.sampleRate} Hz・{p.clip.channels.length === 1 ? 'Mono' : `${p.clip.channels.length} ch`}・{formatTime(p.duration)}
        </Box>
      )}
      <SelectionField
        duration={p.duration}
        selection={p.selection}
        selectionCount={p.selectionCount}
        onSelectionChange={p.onSelectionChange}
        disabled={!p.clip}
      />
      {p.tempo}
      <Box sx={{ flexGrow: 1 }} />
      {p.busy && (
        <Box sx={{ ...ITEM_SX, gap: 1 }}>
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
            {p.taskLabel}
          </Typography>
          <Box sx={{ width: 140, display: 'flex', alignItems: 'center' }}>
            <LinearProgress variant="determinate" value={p.progress * 100} sx={{ flex: 1 }} />
          </Box>
          <Typography variant="caption">{Math.round(p.progress * 100)}%</Typography>
        </Box>
      )}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={p.source}
        disabled={!p.clip}
        onChange={(_, v: Source | null) => v && p.onSourceChange(v)}
        sx={{ height: 20, mx: 1, '& .MuiToggleButton-root': { py: 0, px: 1, fontSize: 11 } }}
      >
        <ToggleButton value="edited">{t('clip.edited')}</ToggleButton>
        <ToggleButton value="original">{t('clip.original')}</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}
