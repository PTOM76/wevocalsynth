import { InspectorFlatContext } from '../inspector/Inspector'
import { useState, type ReactNode } from 'react'
import { Box, IconButton, Stack, Tab, Tabs, Tooltip, useMediaQuery } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAnglesLeft, faAnglesRight, faThumbtack } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../../i18n/i18n'
import { LANDSCAPE_PHONE } from 'pevenmui'

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
  /** 横向きで、右の加工の欄をたためるようにする（スマホの新しい画面） */
  collapsible?: boolean
}

/** 横向きで右の欄を固定するか（たたむか）を覚えるキー */
const PINNED_KEY = 'wevocalsynth.mobilePanelPinned'
const readPinned = () => {
  try {
    return localStorage.getItem(PINNED_KEY) !== '0'
  } catch {
    return true
  }
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
  // 横向きの右の欄: 固定（いつも出す）か、たたむか。たたんだときは、右端の帯で上に重ねて開く（peek）
  const [pinnedState, setPinnedState] = useState(readPinned)
  const pinned = !p.collapsible || pinnedState
  const [peek, setPeek] = useState(false)
  const setPinned = (v: boolean) => {
    setPinnedState(v)
    setPeek(false)
    try {
      localStorage.setItem(PINNED_KEY, v ? '1' : '0')
    } catch {
      // 覚えられなくても動く
    }
  }

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
      {/* タブで切り替えているので、中の区切りの見出し（たたむもの）は出さない */}
      <InspectorFlatContext.Provider value>{tab === 'process' ? p.process : p.volume}</InspectorFlatContext.Provider>
    </Box>
  )

  // 横向き: 高さが足りないので、左に波形と表示ツール、右にタブとパネルを並べる。新しい画面では右の欄をたためる
  if (landscape) {
    const side = (
      <Box sx={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          {p.collapsible && (
            <Tooltip title={t(pinned ? 'mobilePanel.collapse' : 'mobilePanel.pin')}>
              <IconButton size="small" onClick={() => setPinned(!pinned)} sx={{ mx: 0.25 }}>
                <FontAwesomeIcon icon={pinned ? faAnglesRight : faThumbtack} fontSize={13} />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>{tabs}</Box>
        </Stack>
        {panel}
      </Box>
    )
    return (
      <>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, minHeight: 0, p: 0.5, bgcolor: 'background.paper' }}>{p.editor}</Box>
            {viewBar}
            {footer}
          </Box>
          {pinned ? (
            side
          ) : (
            <>
              {/* たたんだとき: 右端の細い帯。押すと右の欄を上に重ねて開き、波形を触ると閉じる */}
              <Tooltip title={t('mobilePanel.open')}>
                <Box
                  role="button"
                  onClick={() => setPeek(true)}
                  sx={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', color: 'text.secondary' }}
                >
                  <FontAwesomeIcon icon={faAnglesLeft} fontSize={12} />
                </Box>
              </Tooltip>
              {peek && (
                <>
                  <Box onPointerDown={() => setPeek(false)} sx={{ position: 'absolute', inset: 0, right: 320, zIndex: 2 }} />
                  <Box sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3, display: 'flex', boxShadow: 6 }}>{side}</Box>
                </>
              )}
            </>
          )}
        </Box>
        {p.playBar}
      </>
    )
  }

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
