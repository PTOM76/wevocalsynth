import type { ReactNode } from 'react'
import { Box, Stack } from '@mui/material'
import { usePanelWidth } from 'pevenmui'

interface Props {
  toolbar: ReactNode
  /** 波形とピッチ帯（ファイルを開く前は案内）。画面の残りの高さをすべて使う */
  editor: ReactNode
  /** 右側のインスペクタに縦に並べるパネル */
  inspector: ReactNode
  statusBar: ReactNode
}

/** インスペクタの幅の既定値と、分割バーで変えられる範囲（px） */
const INSPECTOR_WIDTH = 320
const INSPECTOR_MIN = 240
const INSPECTOR_MAX = 560

/**
 * PC の配置。ツールバー / 編集領域＋右のインスペクタ / ステータスバー。
 * ページ全体はスクロールさせず、編集領域は画面の残りをすべて使う。インスペクタだけは中でスクロールする
 */
export default function DesktopLayout(p: Props) {
  const inspector = usePanelWidth('wevocalsynth.inspectorWidth', INSPECTOR_WIDTH, INSPECTOR_MIN, INSPECTOR_MAX)
  return (
    <>
      {p.toolbar}
      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        {/* 編集領域は端まで使う（トラックの欄・波形の上に余白を作らない） */}
        <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.paper' }}>{p.editor}</Box>
        {inspector.bar}
        {/* 左の編集領域と同じ背景にし、カードで囲まずに分割バーだけで分ける */}
        <Box sx={{ width: inspector.width, flexShrink: 0, overflowY: 'auto', bgcolor: 'background.paper' }}>
          {p.inspector}
        </Box>
      </Stack>
      {p.statusBar}
    </>
  )
}
