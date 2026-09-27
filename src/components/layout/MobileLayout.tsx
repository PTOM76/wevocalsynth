import { useState, type ReactNode } from 'react'
import { Box, Stack, Tab, Tabs } from '@mui/material'
import { useT } from '../../i18n/i18n'

interface Props {
  /** 波形とピッチ帯（ファイルを開く前は案内） */
  editor: ReactNode
  /** 波形のすぐ下の1行（選択範囲など） */
  editorFooter: ReactNode
  process: ReactNode
  volume: ReactNode
  /** 「表示」タブの中身（拡大縮小・表示の切替・ピッチ描画） */
  view: ReactNode
  playBar: ReactNode
}

type TabKey = 'process' | 'volume' | 'view'

/**
 * スマホの配置。編集領域 / タブ（加工・音量・表示）とパネル / 再生バー。
 * ページ全体はスクロールさせず、パネルの中だけをスクロールする
 */
export default function MobileLayout(p: Props) {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('process')
  return (
    <>
      <Box sx={{ flex: '0 0 42%', minHeight: 180, p: 0.5, bgcolor: 'background.paper' }}>{p.editor}</Box>
      <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>{p.editorFooter}</Box>
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 40, borderTop: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', '& .MuiTab-root': { minHeight: 40 } }}
      >
        <Tab value="process" label={t('process.title')} />
        <Tab value="volume" label={t('volume.title')} />
        <Tab value="view" label={t('menu.view')} />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
        {tab === 'process' ? p.process : tab === 'volume' ? p.volume : (
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {p.view}
          </Stack>
        )}
      </Box>
      {p.playBar}
    </>
  )
}
