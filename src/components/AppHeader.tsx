import { useState, type ReactNode } from 'react'
import {
  AppBar,
  Box,
  IconButton,
  ListSubheader,
  Menu,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisVertical, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import AppIcon from './AppIcon'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { renderEntries, type MenuGroup } from './menu/MenuList'
import MenuBar from './menu/MenuBar'
import { useT } from '../i18n/i18n'
import { LANDSCAPE_PHONE } from '../theme'

interface Props {
  menus: MenuGroup[]
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
}

/** 元に戻す・やり直すなどのアイコンボタン（無効時もツールチップを出すため span で包む） */
function HeaderIcon(p: { title: string; icon: IconDefinition; disabled?: boolean; small?: boolean; onClick: () => void }) {
  return (
    <Tooltip title={p.title}>
      <span>
        <IconButton aria-label={p.title} size={p.small ? 'small' : 'medium'} disabled={p.disabled} onClick={p.onClick}>
          <FontAwesomeIcon icon={p.icon} fontSize={p.small ? 13 : undefined} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

/** スマホ: Android の上部バーにある ⋮（その他）メニュー */
function OverflowMenu({ menus }: { menus: MenuGroup[] }) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <IconButton aria-label={t('app.menu')} edge="end" onClick={(e) => setAnchor(e.currentTarget)}>
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220, maxHeight: '80vh' } } }}
      >
        {menus.flatMap((m): ReactNode[] => [
          <ListSubheader key={`h-${m.label}`} sx={{ lineHeight: '32px' }}>
            {m.label}
          </ListSubheader>,
          // スマホではショートカット表記は出さない
          ...renderEntries(
            m.entries.map((e) => ('divider' in e ? e : { ...e, shortcut: undefined })),
            close,
            `${m.label}-`,
          ),
        ])}
      </Menu>
    </>
  )
}

/** 上部のバー。PC は Windows 風の低いメニューバー、スマホは Android 風の上部バー */
export default function AppHeader({ menus, canUndo, canRedo, busy, onUndo, onRedo }: Props) {
  const t = useT()
  const theme = useTheme()
  // 大きめのスマホを横向きにすると幅が md を超えるので、横向きのスマホもスマホの配置にする
  const mobile = useMediaQuery(`${theme.breakpoints.down('md').replace('@media ', '')}, ${LANDSCAPE_PHONE}`)
  const standalone = useMediaQuery('(display-mode: standalone), (display-mode: window-controls-overlay)')
  const landscape = useMediaQuery(LANDSCAPE_PHONE)

  if (mobile) {
    return (
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        {/* 横向きは高さが足りないので低くする */}
        <Toolbar sx={{ minHeight: `${landscape ? 44 : 56}px !important`, gap: 0.5 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontSize: landscape ? 18 : 22, fontWeight: 400 }} noWrap>
            WeVocalSynth
          </Typography>
          <HeaderIcon title={t('common.undo')} icon={faRotateLeft} disabled={!canUndo || busy} onClick={onUndo} />
          <HeaderIcon title={t('common.redo')} icon={faRotateRight} disabled={!canRedo || busy} onClick={onRedo} />
          <OverflowMenu menus={menus} />
        </Toolbar>
      </AppBar>
    )
  }

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar disableGutters sx={{ minHeight: '32px !important', height: 32, px: 1, gap: 0.25 }}>
        {/* PWA としてインストールして開いたときは、ウィンドウのタイトルバーにアイコンが出るので出さない */}
        {!standalone && (
          <Box component="span" sx={{ display: 'flex', mx: 0.75 }}>
            <AppIcon size={16} />
          </Box>
        )}
        <MenuBar menus={menus} />
        <Box sx={{ flexGrow: 1 }} />
        <HeaderIcon small title={`${t('common.undo')} (Ctrl+Z)`} icon={faRotateLeft} disabled={!canUndo || busy} onClick={onUndo} />
        <HeaderIcon small title={`${t('common.redo')} (Ctrl+Y)`} icon={faRotateRight} disabled={!canRedo || busy} onClick={onRedo} />
      </Toolbar>
    </AppBar>
  )
}
