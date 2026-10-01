import { SettingsDialog as PevenSettingsDialog } from 'pevenmui'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { useT } from '../i18n/i18n'
import { settingsCategories } from './settingsSearch'
import { settingsPages } from './SettingsPages'
import type { ProjectSettings } from './ProjectSection'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** 今のプロジェクト（名前・テンポ）。ファイルを開いていなければ null */
  project: ProjectSettings | null
}

/**
 * 設定画面。PC は左の分類から選んで右で変え、「OK」「適用」で反映・保存、「キャンセル」なら捨てる。
 * スマホは分類の一覧から各画面へ進み、変更はその場で反映する（外枠は PevenMUI の SettingsDialog）
 */
export default function SettingsDialog({ open, onClose, settings, onChange, project }: Props) {
  const t = useT()
  return (
    <PevenSettingsDialog
      open={open}
      onClose={onClose}
      title={t('settings.title')}
      settings={settings}
      defaults={DEFAULT_SETTINGS}
      onChange={onChange}
      categories={settingsCategories(t)}
      initial="general"
      windowMode={settings.dialogPip ? 'pip' : 'dialog'}
      pages={(draft, set) => settingsPages({ draft, set, onClose, t, project })}
    />
  )
}
