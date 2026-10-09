// ウィンドウの数が上限のときの画面（作業を開かない）
import { FULL_HEIGHT } from 'pevenmui'
import { Button, Stack, Typography } from '@mui/material'
import { resolveLang, setLang, t } from '../i18n/i18n'
import { useSettings } from '../settings/settings'

/** ウィンドウの数が上限（設定の「同時に開くウィンドウの数」）のときに、作業の画面の代わりに出す（project/windowSlot.ts） */
export default function WindowLimitScreen() {
  const { settings } = useSettings()
  setLang(resolveLang(settings.language))
  return (
    <Stack spacing={2} sx={{ height: FULL_HEIGHT, alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default', textAlign: 'center' }}>
      <Typography>{t('window.limit', { n: settings.maxWindows })}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t('window.limitHint')}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={() => location.reload()}>
          {t('window.retry')}
        </Button>
        <Button onClick={() => window.close()}>{t('common.close')}</Button>
      </Stack>
    </Stack>
  )
}
