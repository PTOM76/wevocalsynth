import { Box, ButtonBase, IconButton, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Clip, Range } from '../audio/types'
import { formatTime } from '../audio/types'
import { useT } from '../i18n/i18n'
import { countRender } from '../debug/debugStats'
import type { ReactNode } from 'react'
import SelectionField from './SelectionField'
import { stableMemo } from './stableMemo'

export type Source = 'edited' | 'original'

interface Props {
  /** プロジェクト名（押すと変える） */
  fileName: string
  onRename: () => void
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
  /** 処理を中断する */
  onCancelTask: () => void
  source: Source
  onSourceChange: (s: Source) => void
  /** BPM の表示（押すとテンポのパネル） */
  tempo: ReactNode
}

const ITEM_SX = { px: 1, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', lineHeight: 'inherit' } as const

/**
 * PC 用のステータスバー（高さ 24px）。ファイルの情報、選択範囲（クリックで数値入力）、
 * 処理中の進捗、加工後／原音の切替を並べる。常に見えていてほしいが、場所は取りたくない情報を置く
 */
function StatusBar(p: Props) {
  countRender('StatusBar')
  const t = useT()
  return (
    <Stack
      direction="row"
      // 行の高さを固定し、英字と日本語のフォントが混ざっても文字の高さがそろうようにする
      sx={{ height: 24, lineHeight: '23px', fontSize: 12, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', alignItems: 'center' }}
    >
      {/* プロジェクト名。押すと名前を変えられる（保存・書き出しのファイル名になる） */}
      <Tooltip title={t('project.renameHint')}>
        <ButtonBase
          disabled={!p.clip}
          onClick={p.onRename}
          sx={{ ...ITEM_SX, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontFamily: 'inherit', fontSize: 12, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {p.fileName || '—'}
        </ButtonBase>
      </Tooltip>
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
            <LinearProgress variant={p.progress < 0 ? 'indeterminate' : 'determinate'} value={Math.max(0, p.progress) * 100} sx={{ flex: 1 }} />
          </Box>
          {p.progress >= 0 && <Typography variant="caption">{Math.round(p.progress * 100)}%</Typography>}
          <Tooltip title={t('task.cancel')}>
            <IconButton size="small" aria-label={t('task.cancel')} onClick={p.onCancelTask} sx={{ p: 0.25 }}>
              <FontAwesomeIcon icon={faXmark} style={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
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

// 関数の props が作り直されても、ほかが同じなら描き直さない
export default stableMemo(StatusBar)
