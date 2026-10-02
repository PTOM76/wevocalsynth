import { useState } from 'react'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faEllipsis } from '@fortawesome/free-solid-svg-icons'
import type { Algorithm } from '../dsp/engine'
import { useT, type MessageKey } from '../i18n/i18n'

/** 選べる処理方式。新しい方式を入れても前の方式は残し、ここから選べるようにする */
export const ALGORITHMS: { value: Algorithm; label: MessageKey; hint: MessageKey }[] = [
  { value: 'sola', label: 'algorithm.sola', hint: 'algorithm.solaHint' },
  { value: 'psola2', label: 'algorithm.psola2', hint: 'algorithm.psola2Hint' },
  { value: 'psola', label: 'algorithm.psola', hint: 'algorithm.psolaHint' },
  { value: 'wsola2', label: 'algorithm.wsola2', hint: 'algorithm.wsola2Hint' },
  { value: 'wsola', label: 'algorithm.wsola', hint: 'algorithm.wsolaHint' },
  { value: 'hpss', label: 'algorithm.hpss', hint: 'algorithm.hpssHint' },
  { value: 'pv2', label: 'algorithm.pv2', hint: 'algorithm.pv2Hint' },
  { value: 'pv', label: 'algorithm.pv', hint: 'algorithm.pvHint' },
]

/** 処理モードの「…」。細かい処理方式を選ぶ。既定（`defaults`。ボーカル・楽器のボタンで選ばれるもの）以外を選んでいるときは強調する */
export default function AlgorithmMenu({ value, defaults, onChange }: { value: Algorithm; defaults: Algorithm[]; onChange: (a: Algorithm) => void }) {
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
        {ALGORITHMS.map((a) => (
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
