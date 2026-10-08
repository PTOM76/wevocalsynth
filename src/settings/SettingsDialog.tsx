// 設定のダイアログ（PevenMUI の設定画面に、分類と中身を渡す）
import { SettingsDialog as PevenSettingsDialog } from 'pevenmui'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { useT } from '../i18n/i18n'
import { settingsCategories } from './settingsSearch'
import { settingsPages } from './SettingsPages'
import type { ProjectSettings } from './ProjectSection'

interface Props {
  open: boolean
  onClose: () => void
  /** 変わるたびに、別の窓で開いている設定画面を手前に出す */
  focusSignal?: number
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** 今のプロジェクト（名前・テンポ）。ファイルを開いていなければ null */
  project: ProjectSettings | null
}

/**
 * 設定画面。PC は左の分類から選んで右で変え、「OK」「適用」で反映・保存、「キャンセル」なら捨てる。
 * スマホは分類の一覧から各画面へ進み、変更はその場で反映する（外枠は PevenMUI の SettingsDialog）
 */
export default function SettingsDialog({ open, onClose, settings, onChange, project, focusSignal }: Props) {
  const t = useT()
  return (
    <PevenSettingsDialog
      open={open}
      focusSignal={focusSignal}
      onClose={onClose}
      title={t('settings.title')}
      settings={settings}
      defaults={DEFAULT_SETTINGS}
      onChange={onChange}
      categories={settingsCategories(t)}
      initial="general"
      pages={(draft, set, go) => settingsPages({ draft, set, onClose, t, project, go })}
    />
  )
}
