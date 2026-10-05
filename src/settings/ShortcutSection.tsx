import { useState } from 'react'
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material'
import { Row } from 'pevenmui'
import { ACTIONS, comboLabel, comboOf, defaultKeys, resolveKeymap, type ActionId, type KeymapOverrides } from './keymap'
import type { CtrlSAction } from './settings'
import { t } from '../i18n/i18n'

interface Props {
  keymap: KeymapOverrides
  ctrlS: CtrlSAction
  onChange: (keymap: KeymapOverrides) => void
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i])

/**
 * キーボードショートカットの割り当て（設定の「編集」）。ボタンを押してから、割り当てるキーを押す（Esc でやめる）。
 * ほかの操作で使っているキーを割り当てたら、そちらからは外す
 */
export default function ShortcutSection({ keymap, ctrlS, onChange }: Props) {
  const [capturing, setCapturing] = useState<ActionId | null>(null)
  const [message, setMessage] = useState('')
  const resolved = resolveKeymap(keymap, ctrlS)

  // 既定と同じになったら、保存から外す（既定を後から変えても、新しい既定になるように）
  const put = (next: KeymapOverrides, id: ActionId, keys: string[]) => {
    if (same(keys, defaultKeys(id, ctrlS))) delete next[id]
    else next[id] = keys
  }

  const assign = (id: ActionId, combo: string) => {
    const next = { ...keymap }
    const taken: string[] = []
    for (const a of ACTIONS) {
      if (a.id === id || !resolved[a.id].includes(combo)) continue
      put(next, a.id, resolved[a.id].filter((k) => k !== combo))
      taken.push(t(a.label))
    }
    put(next, id, [combo])
    onChange(next)
    setMessage(taken.length ? t('settings.keyTaken', { key: comboLabel(combo), names: taken.join('、') }) : '')
  }

  return (
    <>
      {ACTIONS.map((a) => {
        const keys = resolved[a.id]
        const changed = !same(keys, defaultKeys(a.id, ctrlS))
        const on = capturing === a.id
        return (
          <Row key={a.id} label={t(a.label)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant={on ? 'contained' : 'outlined'}
                sx={{ minWidth: 120, textTransform: 'none', fontFamily: on ? undefined : 'monospace' }}
                onClick={() => setCapturing(on ? null : a.id)}
                onBlur={() => on && setCapturing(null)}
                onKeyDown={(e) => {
                  if (!on) return
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return setCapturing(null)
                  const combo = comboOf(e)
                  if (!combo) return
                  assign(a.id, combo)
                  setCapturing(null)
                }}
              >
                {on ? t('settings.keyPress') : keys.length ? keys.map(comboLabel).join(' / ') : t('settings.keyNone')}
              </Button>
              <Tooltip title={t('settings.keyClear')}>
                <span>
                  <IconButton size="small" aria-label={t('settings.keyClear')} disabled={!keys.length} onClick={() => {
                    const next = { ...keymap }
                    put(next, a.id, [])
                    onChange(next)
                  }}>
                    ×
                  </IconButton>
                </span>
              </Tooltip>
              {changed && (
                <Button size="small" onClick={() => {
                  const next = { ...keymap }
                  delete next[a.id]
                  onChange(next)
                }}>
                  {t('settings.keyDefault')}
                </Button>
              )}
            </Box>
          </Row>
        )
      })}
      <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button size="small" disabled={!Object.keys(keymap).length} onClick={() => (onChange({}), setMessage(''))}>
          {t('settings.keyResetAll')}
        </Button>
        {message && <Typography className="selectable" sx={{ fontSize: 12, color: 'primary.main' }}>{message}</Typography>}
      </Box>
    </>
  )
}
