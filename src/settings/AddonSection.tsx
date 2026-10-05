import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import {
  ADDONS,
  addonSize,
  addonsSupported,
  fetchManifest,
  installedManifest,
  uninstallWithUnused,
  type AddonInfo,
  type AddonManifest,
} from '../addons/addons'
import { useAddonInstall } from '../addons/AddonInstallDialog'
import { useT } from '../i18n/i18n'
import { useConfirm, useHighlighter } from 'pevenmui'

const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`

interface Status {
  installed: AddonManifest | null
  /** 配信中のもの（オフラインなどで取れなければ null） */
  latest: AddonManifest | null
}

/** 追加機能 `ids` の一覧と、導入・更新・削除（設定の「ボーカル抽出」「開発者向け」に置く） */
export default function AddonSection({ ids }: { ids: string[] }) {
  const t = useT()
  const { request, dialog } = useAddonInstall()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const hit = useHighlighter()
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [message, setMessage] = useState<string | null>(null)
  const list = ADDONS.filter((a) => ids.includes(a.id))

  const refresh = () => {
    for (const a of list) {
      void Promise.all([installedManifest(a.id), fetchManifest(a.id).catch(() => null)]).then(([installed, latest]) =>
        setStatus((s) => ({ ...s, [a.id]: { installed, latest } })),
      )
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [ids.join()])

  if (!addonsSupported()) return <Typography sx={{ gridColumn: '1 / -1', fontSize: 13 }}>{t('addon.unsupported')}</Typography>

  const describe = (s: Status | undefined) => {
    if (!s) return t('addon.checking')
    // 配信中のマニフェストが取れないと導入できない（オフライン、または追加機能を置いていない開発サーバーなど）
    if (!s.installed) return s.latest ? t('addon.notInstalledSize', { size: mb(addonSize(s.latest)) }) : t('addon.notAvailable')
    const info = t('addon.installedInfo', { version: s.installed.version, size: mb(addonSize(s.installed)) })
    return s.latest && s.latest.version !== s.installed.version ? `${info} / ${t('addon.updateAvailable', { version: s.latest.version })}` : info
  }

  const install = async (a: AddonInfo) => {
    if (await request(a.id)) setMessage(t('addon.installed'))
    refresh()
  }
  const remove = async (a: AddonInfo) => {
    if (!(await confirm({ message: t('addon.deleteConfirm', { name: t(a.name) }), okLabel: t('data.delete'), danger: true }))) return
    // 依存していた実行環境なども、使われなくなったら一緒に消す
    await uninstallWithUnused(a.id)
    setMessage(t('addon.deleted'))
    refresh()
  }

  return (
    <>
      {list.map((a) => {
        const s = status[a.id]
        const updatable = !!(s?.installed && s.latest && s.latest.version !== s.installed.version)
        // 2 列をまたいだ幅は列の幅の合計で、中身の文字の長さ（導入の前と後でも変わる）で変わるので、まとまり（Group）の枠の幅いっぱいにそろえる（cqi は枠の幅）
        return (
          <Box key={a.id} sx={{ gridColumn: '1 / -1', width: '100cqi', maxWidth: '100cqi', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, ...hit(t(a.shortName ?? a.name)) }}>{t(a.shortName ?? a.name)}</Typography>
              <Typography className="selectable" sx={{ fontSize: 11, color: 'text.secondary' }}>{describe(s)}</Typography>
            </Box>
            {(!s?.installed || updatable) && (
              <Button size="small" variant="outlined" disabled={!s?.latest} onClick={() => void install(a)} sx={{ flexShrink: 0 }}>
                {t(updatable ? 'addon.update' : 'addon.install')}
              </Button>
            )}
            {s?.installed && (
              <Button size="small" variant="outlined" color="error" onClick={() => void remove(a)} sx={{ flexShrink: 0 }}>
                {t('data.delete')}
              </Button>
            )}
          </Box>
        )
      })}
      {message && <Typography className="selectable" sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'primary.main' }}>{message}</Typography>}
      {dialog}
      {confirmDialog}
    </>
  )
}
