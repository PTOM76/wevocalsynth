import { useState, type ReactNode } from 'react'
import { Box, Stack, Tab, Tabs, useMediaQuery } from '@mui/material'
import { useT } from '../../i18n/i18n'
import { LANDSCAPE_PHONE } from '../../theme'

interface Props {
  /** 波形とピッチ帯（ファイルを開く前は案内） */
  editor: ReactNode
  /** 波形のすぐ下の1行（選択範囲など） */
  editorFooter: ReactNode
  process: ReactNode
  volume: ReactNode
  /** 波形の表示ツール（拡大縮小・表示の切替・ピッチ描画）。波形のすぐ下に常に出す */
  view: ReactNode
  playBar: ReactNode
}

type TabKey = 'process' | 'volume'

/**
 * スマホの配置。編集領域 / 表示ツール / タブ（加工・音量）とパネル / 再生バー。
 * 表示ツールは波形を見ながら使うため、タブに入れず常に出しておく。
 * ページ全体はスクロールさせず、パネルの中だけをスクロールする
 */
export default function MobileLayout(p: Props) {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('process')
  const landscape = useMediaQuery(LANDSCAPE_PHONE)

  const viewBar = (
    <Stack
        direction="row"
        useFlexGap
        // ボタンが増えても1段に収め、はみ出した分は横にスクロールする（折り返すと波形の高さが削られる）
        sx={{ flexWrap: 'nowrap', overflowX: 'auto', flexShrink: 0, alignItems: 'center', gap: 0.5, px: 0.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', scrollbarWidth: 'none', '& > *': { flexShrink: 0 } }}
      >
        {p.view}
      </Stack>
  )
  const footer = <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>{p.editorFooter}</Box>
  const tabs = (
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 40, borderTop: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', '& .MuiTab-root': { minHeight: 40 } }}
      >
        <Tab value="process" label={t('process.title')} />
        <Tab value="volume" label={t('volume.title')} />
      </Tabs>
  )
  const panel = (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
      {tab === 'process' ? p.process : p.volume}
    </Box>
  )

  // 横向き: 高さが足りないので、左に波形と表示ツール、右にタブとパネルを並べる
  if (landscape)
    return (
      <>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, minHeight: 0, p: 0.5, bgcolor: 'background.paper' }}>{p.editor}</Box>
            {viewBar}
            {footer}
          </Box>
          <Box sx={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider' }}>
            {tabs}
            {panel}
          </Box>
        </Box>
        {p.playBar}
      </>
    )

  return (
    <>
      <Box sx={{ flex: '0 0 42%', minHeight: 180, p: 0.5, bgcolor: 'background.paper' }}>{p.editor}</Box>
      {viewBar}
      {footer}
      {tabs}
      {panel}
      {p.playBar}
    </>
  )
}
