// 処理方式の一覧と選ぶメニュー（従来の方式と試験的な方式の表示を含む）
import { useState } from 'react'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faEllipsis } from '@fortawesome/free-solid-svg-icons'
import type { Algorithm } from '../dsp/engine'
import { useT } from '../i18n/i18n'

// 処理方式の一覧と、表示するものの選び方は wevocal-lib（WeVocal Studio と共通）
export { ALGORITHMS, setExperimentalAlgorithms, visibleAlgorithms } from 'wevocal-lib'
import { visibleAlgorithms } from 'wevocal-lib'

/** 処理モードの「…」。細かい処理方式を選ぶ。既定（`defaults`。ボーカル・楽器のボタンで選ばれるもの）以外を選んでいるときは強調する */
export default function AlgorithmMenu({ value, defaults, showLegacy, onChange }: { value: Algorithm; defaults: Algorithm[]; showLegacy: boolean; onChange: (a: Algorithm) => void }) {
  const isDefault = (a: Algorithm) => defaults.includes(a)
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title={t('algorithm.more')}>
        <IconButton
          size="small"
          aria-label={t('algorithm.more')}
          color={isDefault(value) ? 'default' : 'primary'}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ width: 26, height: 24, flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1 }}
        >
          <FontAwesomeIcon icon={faEllipsis} fontSize={12} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {visibleAlgorithms(showLegacy, [value, ...defaults]).map((a) => (
          <MenuItem
            key={a.value}
            dense
            onClick={() => {
              setAnchor(null)
              onChange(a.value)
            }}
          >
            <ListItemIcon sx={{ visibility: a.value === value ? 'visible' : 'hidden' }}>
              <FontAwesomeIcon icon={faCheck} />
            </ListItemIcon>
            <ListItemText primary={t(a.label)} secondary={t(a.hint)} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
