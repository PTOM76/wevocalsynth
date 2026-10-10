// 設定の「データ」（使用量と削除）
import { useEffect, useState } from 'react'
import { Box, Button } from '@mui/material'
import {
  clearLocalSettings,
  clearOfflineCache,
  clearWorkData,
  isPersisted,
  requestPersist,
  restoreFromFolder,
  storageUsage,
} from '../project/storage'
import { mirrorClearAll, mirroredSize } from '../project/dataFolder'
import { addonFolder, addonsSizeIn, clearAddonsIn } from '../addons/addons'
import { useT, type MessageKey } from '../i18n/i18n'
import { DangerButton, DataHeading, DataRow, DataText, useConfirm, useDownloadingIds } from 'pevenmui'
import { formatMb } from 'pevenmui/web'
import { otherWindowsOpen } from '../project/windowSlot'

const mb = formatMb

/** 設定の「データ」: ブラウザ内の使用量と、作業データ・キャッシュ・設定の削除 */
export default function DataSection({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof storageUsage>>>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [addonBytes, setAddonBytes] = useState(0)
  // 追加機能の保存先のフォルダー（試験的）。選んでいて許可があるときだけ、そのデータを分けて表示する
  const [folder, setFolder] = useState<{ name: string; bytes: number; dataBytes: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  // 追加機能のダウンロード中は、追加機能を消す操作を押せなくする（書きかけを消して壊さないため）
  const downloading = useDownloadingIds().size > 0

  const refresh = () => {
    void storageUsage().then(setUsage)
    void isPersisted().then(setPersisted)
    void addonsSizeIn('cache').then(setAddonBytes)
    void (async () => {
      const dir = await addonFolder.saved()
      setFolder(dir && (await addonFolder.permission()) === 'granted' ? { name: dir.name, bytes: await addonsSizeIn('folder'), dataBytes: await mirroredSize() } : null)
    })()
  }
  useEffect(refresh, [])

  /** 確認してから `run` し、結果を表示する。`okKey` は確認ダイアログの実行ボタンの文字 */
  const act = async (okKey: MessageKey, confirmKey: MessageKey | (() => Promise<MessageKey>), run: () => Promise<void> | void, doneKey: MessageKey) => {
    const key = typeof confirmKey === 'function' ? await confirmKey() : confirmKey
    if (!(await confirm({ message: t(key), okLabel: t(okKey), danger: true }))) return
    await run()
    setMessage(t(doneKey))
    refresh()
  }

  // ほかのウィンドウが開いていれば、その自動保存も消えることを伝える（project/windowSlot.ts）
  const workConfirm = async (): Promise<MessageKey> => ((await otherWindowsOpen().catch(() => false)) ? 'data.workConfirmOthers' : 'data.workConfirm')

  const row = (label: MessageKey, help: MessageKey, button: React.ReactNode, vars?: Record<string, string>) => (
    <DataRow label={t(label)} help={t(help, vars)}>
      {button}
    </DataRow>
  )
  const danger = (label: MessageKey, onClick: () => void, disabled = false) => <DangerButton label={t(label)} onClick={onClick} disabled={disabled} />

  // 保存先のフォルダーがあるときは、ブラウザ内と保存先フォルダーに分けて見出しを出す
  const heading = (text: string) => <DataHeading>{text}</DataHeading>

  return (
    <>
      {folder && heading(t('data.browser'))}
      <DataText>{usage ? t('data.usage', { usage: mb(usage.usage), quota: mb(usage.quota) }) : t('data.usageUnknown')}</DataText>
      {/* 何が容量を使っているかの内訳（Chrome などだけ） */}
      {usage?.details && (
        <DataText note>
          {t('data.usageDetails', {
            caches: mb(usage.details.caches ?? 0),
            idb: mb(usage.details.indexedDB ?? 0),
            sw: mb(usage.details.serviceWorkerRegistrations ?? 0),
          })}
        </DataText>
      )}
      {row(
        'data.work',
        'data.workHelp',
        danger('data.delete', () => void act('data.delete', workConfirm, clearWorkData, 'data.workDone')),
      )}
      {row(
        'data.cache',
        'data.cacheHelp',
        danger('data.delete', () => void act('data.delete', 'data.cacheConfirm', () => clearOfflineCache(), 'data.cacheDone')),
      )}
      {row(
        'data.addons',
        'data.addonsHelp',
        danger('data.delete', () => void act('data.delete', 'data.addonsConfirm', () => clearAddonsIn('cache'), 'data.addonsDone'), downloading),
        { size: mb(addonBytes) },
      )}
      {row(
        'data.settings',
        'data.settingsHelp',
        danger('data.reset', () =>
          void act(
            'data.reset',
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
            'data.deleteAll',
            'data.allConfirm',
            async () => {
              await Promise.all([clearWorkData(), clearOfflineCache(true)])
              clearLocalSettings()
              location.reload()
            },
            'data.allDone',
          ),
          downloading,
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
      {folder && (
        <>
          {heading(t('data.folder', { name: folder.name }))}
          {row(
            'data.addons',
            'data.folderAddonsHelp',
            danger('data.delete', () => void act('data.delete', 'data.folderAddonsConfirm', () => clearAddonsIn('folder'), 'data.addonsDone'), downloading),
            { size: mb(folder.bytes) },
          )}
          {/* 写した設定と作業（PWA を入れ直したときは、ここから戻す。src/project/dataFolder.ts） */}
          {row(
            'data.folderData',
            'data.folderDataHelp',
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={!folder.dataBytes}
                onClick={() =>
                  void (async () => {
                    if (!(await confirm({ message: t('data.folderRestoreConfirm'), okLabel: t('data.folderRestore') }))) return
                    if (await restoreFromFolder()) location.reload()
                  })()
                }
              >
                {t('data.folderRestore')}
              </Button>
              {danger('data.delete', () => void act('data.delete', 'data.folderDataConfirm', mirrorClearAll, 'data.folderDataDone'), !folder.dataBytes)}
            </Box>,
            { size: mb(folder.dataBytes) },
          )}
        </>
      )}
      {message && <DataText done>{message}</DataText>}
      {dialog}
    </>
  )
}
