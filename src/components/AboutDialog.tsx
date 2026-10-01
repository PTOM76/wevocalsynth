import { Link } from '@mui/material'
import { AboutDialog as PevenAboutDialog } from 'pevenmui'
import AppIcon from './AppIcon'
import { useT } from '../i18n/i18n'
import { APP_BUILD } from '../pwa/updateCheck'
import { REPOSITORY_URL } from '../links'

const AUTHOR = 'PitaQ'

/** 「このアプリについて」: アプリ名・バージョン・作者・リポジトリ・ライセンス */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  return (
    <PevenAboutDialog
      open={open}
      onClose={onClose}
      icon={<AppIcon size={56} />}
      name="WeVocalSynth"
      rows={[
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
      ]}
    />
  )
}
