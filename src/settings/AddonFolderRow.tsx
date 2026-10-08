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
  const refresh = async () => {
    setName((await savedAddonFolder())?.name ?? null)
    setPermission(await addonFolderPermission())
  }
  useEffect(() => void refresh(), [])
  const choose = async () => {
    if (await chooseAddonFolder()) notifyAddonsChanged()
    await refresh()
  }
  const allow = async () => {
    if (await requestAddonFolderPermission()) notifyAddonsChanged()
    await refresh()
  }
  return (
    <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 1, pl: 4 }}>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: pevenFont('base') }} noWrap>
        {name ? t('addonFolder.current', { name }) : t('addonFolder.none')}
      </Typography>
      {name && permission !== 'granted' && (
        <Button size="small" variant="contained" onClick={() => void allow()}>
          {t('addonFolder.allow')}
        </Button>
      )}
      <Button size="small" variant="outlined" onClick={() => void choose()} sx={{ flexShrink: 0 }}>
        {t('addonFolder.choose')}
      </Button>
    </Box>
  )
}
