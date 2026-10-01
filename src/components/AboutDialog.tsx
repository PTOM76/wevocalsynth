import { Box, Button, Dialog, DialogActions, DialogContent, Link, Stack, Typography } from '@mui/material'
import AppIcon from './AppIcon'
import { useT } from '../i18n/i18n'
import { APP_BUILD } from '../pwa/updateCheck'

const REPOSITORY_URL = 'https://github.com/PTOM76/wevocalsynth'
const AUTHOR = 'PitaQ'

/** 「このアプリについて」: アプリ名・バージョン・作者・リポジトリ・ライセンス */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const rows: [string, React.ReactNode][] = [
    // コミットまで出して、バージョン番号を上げずにデプロイした版も見分けられるようにする
    [t('about.version'), <span className="selectable">{APP_BUILD}</span>],
    [t('about.author'), AUTHOR],
    [
      'GitHub',
      <Link className="selectable" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
        {REPOSITORY_URL.replace('https://', '')}
      </Link>,
    ],
    [t('about.license'), t('about.licenseText')],
  ]
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent>
        <Stack spacing={2} sx={{ alignItems: 'center', pt: 1 }}>
          <AppIcon size={56} />
          <Typography variant="h6">WeVocalSynth</Typography>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, m: 0, width: '100%' }}>
            {rows.map(([k, v]) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography component="dt" sx={{ fontSize: 13, color: 'text.secondary' }}>
                  {k}
                </Typography>
                <Typography component="dd" sx={{ fontSize: 13, m: 0, wordBreak: 'break-all' }}>
                  {v}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
