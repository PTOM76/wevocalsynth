import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import {
  clearLocalSettings,
  clearOfflineCache,
  clearWorkData,
  isPersisted,
  requestPersist,
  storageUsage,
} from '../project/storage'
import { useT, type MessageKey } from '../i18n/i18n'

const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`

/** 設定の「データ」: ブラウザ内の使用量と、作業データ・キャッシュ・設定の削除 */
export default function DataSection({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = () => {
    void storageUsage().then(setUsage)
    void isPersisted().then(setPersisted)
  }
  useEffect(refresh, [])

  /** 確認してから `run` し、結果を表示する */
  const act = async (confirmKey: MessageKey, run: () => Promise<void> | void, doneKey: MessageKey) => {
    if (!window.confirm(t(confirmKey))) return
    await run()
    setMessage(t(doneKey))
    refresh()
  }

  const row = (label: MessageKey, help: MessageKey, button: React.ReactNode) => (
    <Box sx={{ gridColumn: '1 / -1', width: 0, minWidth: '100%', display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13 }}>{t(label)}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t(help)}</Typography>
      </Box>
      {button}
    </Box>
  )
  const danger = (label: MessageKey, onClick: () => void) => (
    <Button size="small" variant="outlined" color="error" onClick={onClick} sx={{ flexShrink: 0 }}>
      {t(label)}
    </Button>
  )

  return (
    <>
      <Typography sx={{ gridColumn: '1 / -1', fontSize: 13 }}>
        {usage ? t('data.usage', { usage: mb(usage.usage), quota: mb(usage.quota) }) : t('data.usageUnknown')}
      </Typography>
      {row(
        'data.work',
        'data.workHelp',
        danger('data.delete', () => void act('data.workConfirm', clearWorkData, 'data.workDone')),
      )}
      {row(
        'data.cache',
        'data.cacheHelp',
        danger('data.delete', () => void act('data.cacheConfirm', clearOfflineCache, 'data.cacheDone')),
      )}
      {row(
        'data.settings',
        'data.settingsHelp',
        danger('data.reset', () =>
          void act(
            'data.settingsConfirm',
            () => {
              clearLocalSettings()
              // 開いている設定画面の値は古いので、閉じて読み込み直す
              onClose()
              location.reload()
            },
            'data.settingsDone',
          ),
        ),
      )}
      {row(
        'data.all',
        'data.allHelp',
        danger('data.deleteAll', () =>
          void act(
            'data.allConfirm',
            async () => {
              await Promise.all([clearWorkData(), clearOfflineCache()])
              clearLocalSettings()
              location.reload()
            },
            'data.allDone',
          ),
        ),
      )}
      {row(
        'data.persist',
        persisted ? 'data.persistOn' : 'data.persistHelp',
        <Button
          size="small"
          variant="outlined"
          disabled={persisted !== false}
          onClick={() => void requestPersist().then((ok) => (setPersisted(ok), setMessage(t(ok ? 'data.persistDone' : 'data.persistDenied'))))}
          sx={{ flexShrink: 0 }}
        >
          {t('data.persistButton')}
        </Button>,
      )}
      {message && <Typography sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'primary.main' }}>{message}</Typography>}
    </>
  )
}
