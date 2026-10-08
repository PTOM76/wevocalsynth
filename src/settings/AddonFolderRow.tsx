import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { pevenFont } from 'pevenmui'
import { addonFolderPermission, chooseAddonFolder, requestAddonFolderPermission, savedAddonFolder } from '../addons/addonFolder'
import { notifyAddonsChanged } from '../addons/addons'
import { useT } from '../i18n/i18n'

/** 追加機能の保存先のフォルダー（試験的）。選んだフォルダーの名前と、選ぶボタン、許可がなければ許可するボタン */
export default function AddonFolderRow() {
  const t = useT()
  const [name, setName] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = async () => {
    setName((await savedAddonFolder())?.name ?? null)
    setPermission(await addonFolderPermission())
  }
  useEffect(() => void refresh(), [])
  // 押したボタンの窓（設定を別の窓で開いているときは、その窓から選ぶ画面や許可の確認を出す）
  const winOf = (e: React.MouseEvent) => e.currentTarget.ownerDocument.defaultView ?? window
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      if (await fn()) notifyAddonsChanged()
    } catch (e) {
      setError(String(e))
    }
    await refresh()
  }
  const choose = (e: React.MouseEvent) => void run(() => chooseAddonFolder(winOf(e)))
  const allow = () => void run(requestAddonFolderPermission)
  return (
    <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, pl: 4 }}>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: pevenFont('base') }} noWrap>
        {name ? t('addonFolder.current', { name }) : t('addonFolder.none')}
      </Typography>
      {name && permission !== 'granted' && (
        <Button size="small" variant="contained" onClick={allow}>
          {t('addonFolder.allow')}
        </Button>
      )}
      <Button size="small" variant="outlined" onClick={choose} sx={{ flexShrink: 0 }}>
        {t('addonFolder.choose')}
      </Button>
      {error && <Typography sx={{ width: '100%', color: 'error.main', fontSize: pevenFont('sm') }}>{error}</Typography>}
    </Box>
  )
}
