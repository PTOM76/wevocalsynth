import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import {
  ADDONS,
  addonSize,
  addonsSupported,
  fetchManifest,
  installedManifest,
  loadAddon,
  uninstall,
  type AddonInfo,
  type AddonManifest,
} from '../addons/addons'
import { useAddonInstall } from '../addons/AddonInstallDialog'
import { useT } from '../i18n/i18n'

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
    if (!s.installed) return s.latest ? t('addon.notInstalledSize', { size: mb(addonSize(s.latest)) }) : t('addon.notInstalled')
    const info = t('addon.installedInfo', { version: s.installed.version, size: mb(addonSize(s.installed)) })
    return s.latest && s.latest.version !== s.installed.version ? `${info} / ${t('addon.updateAvailable', { version: s.latest.version })}` : info
  }

  const install = async (a: AddonInfo) => {
    if (await request(a.id)) setMessage(t('addon.installed'))
    refresh()
  }
  const remove = async (a: AddonInfo) => {
    if (!window.confirm(t('addon.deleteConfirm', { name: t(a.name) }))) return
    await uninstall(a.id)
    setMessage(t('addon.deleted'))
    refresh()
  }
  // 開発者向け: 保存先から読み込めるかの確認（確認用の追加機能は `check()` を持つ）
  const check = async (a: AddonInfo) => {
    try {
      const mod = await loadAddon<{ check: () => string }>(a.id)
      setMessage(mod.check())
    } catch (e) {
      setMessage(String(e))
    }
  }

  return (
    <>
      {list.map((a) => {
        const s = status[a.id]
        const updatable = !!(s?.installed && s.latest && s.latest.version !== s.installed.version)
        return (
          <Box key={a.id} sx={{ gridColumn: '1 / -1', width: 0, minWidth: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13 }}>{t(a.name)}</Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{describe(s)}</Typography>
            </Box>
            {a.dev && s?.installed && (
              <Button size="small" onClick={() => void check(a)} sx={{ flexShrink: 0 }}>
                {t('addon.check')}
              </Button>
            )}
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
      {message && <Typography sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'primary.main' }}>{message}</Typography>}
      {dialog}
    </>
  )
}
