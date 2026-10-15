// 設定の「プラグイン」（導入と管理。部品は wevocal-lib の PluginManager。WeVocal Studio と共通）
import { PluginManager } from 'wevocal-lib/react'
import { i18n, useT } from '../i18n/i18n'

export default function PluginsSection() {
  const t = useT()
  return <PluginManager t={t} lang={i18n.useLang()} />
}
