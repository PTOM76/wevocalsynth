import { useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListSubheader,
  Menu,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faRotateLeft, faRotateRight, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import { renderEntries, type MenuGroup } from './menu/MenuList'
import { useT } from '../i18n/i18n'

interface Props {
  menus: MenuGroup[]
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
}

/** PC: 「ファイル・編集・表示…」のメニューバー */
function MenuBar({ menus }: { menus: MenuGroup[] }) {
  const [open, setOpen] = useState<{ index: number; anchor: HTMLElement } | null>(null)
  const close = () => setOpen(null)
  return (
    <>
      {menus.map((m, index) => (
        <Button
          key={m.label}
          color="inherit"
          size="small"
          onClick={(e) => setOpen({ index, anchor: e.currentTarget })}
          // 別のメニューを開いているときはマウスを乗せるだけで切り替える（デスクトップアプリと同じ操作感）
          onMouseEnter={(e) => open && open.index !== index && setOpen({ index, anchor: e.currentTarget })}
        >
          {m.label}
        </Button>
      ))}
      <Menu anchorEl={open?.anchor} open={!!open} onClose={close}>
        {open && renderEntries(menus[open.index].entries, close)}
      </Menu>
    </>
  )
}

/** スマホ: 下から出るメニュー一覧 */
function MobileMenu({ menus }: { menus: MenuGroup[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <>
      <IconButton aria-label={t('app.menu')} onClick={() => setOpen(true)}>
        <FontAwesomeIcon icon={faBars} />
      </IconButton>
      <Drawer anchor="bottom" open={open} onClose={close}>
        <List sx={{ pb: 2, maxHeight: '80vh', overflowY: 'auto' }}>
          {menus.map((m) => (
            <Box key={m.label}>
              <ListSubheader>{m.label}</ListSubheader>
              {renderEntries(
                m.entries.map((e) => ('divider' in e ? e : { ...e, shortcut: undefined })),
                close,
              )}
            </Box>
          ))}
        </List>
      </Drawer>
    </>
  )
}

/** 上部のアプリバー。PC ではメニューバー、スマホではメニューボタンにする */
export default function AppHeader({ menus, canUndo, canRedo, busy, onUndo, onRedo }: Props) {
  const t = useT()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Box component="span" sx={{ color: 'primary.main', display: 'flex' }}>
          <FontAwesomeIcon icon={faWaveSquare} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 500, mr: 1 }} noWrap>
          WeVocalSynth
        </Typography>
        {!mobile && <MenuBar menus={menus} />}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={`${t('common.undo')} (Ctrl+Z)`}>
          <span>
            <IconButton aria-label={t('common.undo')} onClick={onUndo} disabled={!canUndo || busy}>
              <FontAwesomeIcon icon={faRotateLeft} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`${t('common.redo')} (Ctrl+Y)`}>
          <span>
            <IconButton aria-label={t('common.redo')} onClick={onRedo} disabled={!canRedo || busy}>
              <FontAwesomeIcon icon={faRotateRight} />
            </IconButton>
          </span>
        </Tooltip>
        {mobile && <MobileMenu menus={menus} />}
      </Toolbar>
    </AppBar>
  )
}
