// ウィンドウの数が上限のときの画面（部品は PevenMUI。WeVocal Studio と共通）
import { WindowLimitScreen as PevenScreen } from 'pevenmui'
import { resolveLang, setLang, t } from '../i18n/i18n'
import { useSettings } from '../settings/settings'

/** ウィンドウの数が上限（設定の「同時に開くウィンドウの数」）のときに、作業の画面の代わりに出す（project/windowSlot.ts） */
export default function WindowLimitScreen() {
  const { settings } = useSettings()
  setLang(resolveLang(settings.language))
  return <PevenScreen message={t('window.limit', { n: settings.maxWindows })} hint={t('window.limitHint')} retry={t('window.retry')} close={t('common.close')} />
}
