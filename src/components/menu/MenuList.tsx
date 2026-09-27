import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'

/** メニューの1項目。`divider` なら区切り線 */
export type MenuEntry =
  | {
      label: string
      /** 表示用のショートカット（例: "Ctrl+Z"） */
      shortcut?: string
      disabled?: boolean
      /** 指定すると ON/OFF の項目になり、ON のときチェックを表示する */
      checked?: boolean
      onClick: () => void
    }
  | { divider: true }

/** メニューのまとまり（「ファイル」「編集」など） */
export interface MenuGroup {
  label: string
  entries: MenuEntry[]
}

/** 項目の一覧を MUI のメニュー項目として並べる。選んだらメニューを閉じる */
export function renderEntries(entries: MenuEntry[], close: () => void) {
  return entries.map((e, i) =>
    'divider' in e ? (
      <Divider key={i} />
    ) : (
      <MenuItem
        key={i}
        dense
        disabled={e.disabled}
        onClick={() => {
          close()
          e.onClick()
        }}
      >
        {e.checked !== undefined && (
          <ListItemIcon sx={{ visibility: e.checked ? 'visible' : 'hidden' }}>
            <FontAwesomeIcon icon={faCheck} />
          </ListItemIcon>
        )}
        <ListItemText>{e.label}</ListItemText>
        {e.shortcut && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
            {e.shortcut}
          </Typography>
        )}
      </MenuItem>
    ),
  )
}

/** 右クリックで開くメニュー（`position` はクリック位置、null なら閉じている） */
export function ContextMenu(props: {
  position: { x: number; y: number } | null
  entries: MenuEntry[]
  onClose: () => void
}) {
  return (
    <Menu
      open={!!props.position}
      onClose={props.onClose}
      anchorReference="anchorPosition"
      anchorPosition={props.position ? { top: props.position.y, left: props.position.x } : undefined}
    >
      {renderEntries(props.entries, props.onClose)}
    </Menu>
  )
}
