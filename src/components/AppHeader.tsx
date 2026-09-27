import { useState, type ReactNode } from 'react'
import {
  AppBar,
  Box,
  ButtonBase,
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
import { faEllipsisVertical, faRotateLeft, faRotateRight, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
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

/**
 * メニューバーの文字の並べ方。英字（Roboto）と日本語（システムのフォント）では文字の上下の余白が
 * 違うため、行の高さを固定して縦方向の中央にそろえ、フォントが混ざっても高さがずれないようにする
 */
const BAR_TEXT_SX = {
  height: 26,
  lineHeight: '26px',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
} as const

/** PC: Windows のアプリのような、高さを抑えた「ファイル・編集・表示…」のメニューバー */
function MenuBar({ menus }: { menus: MenuGroup[] }) {
  const [open, setOpen] = useState<{ index: number; anchor: HTMLElement } | null>(null)
  const close = () => setOpen(null)
  return (
    <>
      {menus.map((m, index) => (
        <ButtonBase
          key={m.label}
          onClick={(e) => setOpen({ index, anchor: e.currentTarget })}
          // 別のメニューを開いているときはマウスを乗せるだけで切り替える（デスクトップアプリと同じ操作感）
          onMouseEnter={(e) => open && open.index !== index && setOpen({ index, anchor: e.currentTarget })}
          sx={{
            ...BAR_TEXT_SX,
            px: 1.25,
            borderRadius: 0.5,
            bgcolor: open?.index === index ? 'action.selected' : undefined,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {m.label}
        </ButtonBase>
      ))}
      <Menu
        anchorEl={open?.anchor}
        open={!!open}
        onClose={close}
        slotProps={{ paper: { sx: { minWidth: 240 } }, list: { dense: true, sx: { py: 0.5 } } }}
      >
        {open && renderEntries(menus[open.index].entries, close)}
      </Menu>
    </>
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
  const mobile = useMediaQuery(theme.breakpoints.down('md'))

  if (mobile) {
    return (
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: 56, gap: 0.5 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontSize: 22, fontWeight: 400 }} noWrap>
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
        <Box component="span" sx={{ color: 'primary.main', display: 'flex', fontSize: 14, mx: 0.75 }}>
          <FontAwesomeIcon icon={faWaveSquare} />
        </Box>
        <Typography component="span" sx={{ ...BAR_TEXT_SX, fontWeight: 500, mr: 1 }} noWrap>
          WeVocalSynth
        </Typography>
        <MenuBar menus={menus} />
        <Box sx={{ flexGrow: 1 }} />
        <HeaderIcon small title={`${t('common.undo')} (Ctrl+Z)`} icon={faRotateLeft} disabled={!canUndo || busy} onClick={onUndo} />
        <HeaderIcon small title={`${t('common.redo')} (Ctrl+Y)`} icon={faRotateRight} disabled={!canRedo || busy} onClick={onRedo} />
      </Toolbar>
    </AppBar>
  )
}
