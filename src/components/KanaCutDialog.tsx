// 一音ずつ切り出すダイアログ（部品と手順は analyzer。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import LibKanaCutDialog from '../../analyzer/src/KanaCutDialog'
import { createKanaHost } from '../../analyzer/src/kanaCut'
import { loadAddon } from '../addons/addons'
import { useAppSettings } from '../settings/settings'
import { useT } from '../i18n/i18n'

const host = createKanaHost((id) => loadAddon(id))

export default function KanaCutDialog(p: Omit<ComponentProps<typeof LibKanaCutDialog>, 't' | 'host' | 'vocalBefore' | 'onVocalBeforeChange' | 'threads'>) {
  const t = useT()
  const { settings, update } = useAppSettings()
  return <LibKanaCutDialog {...p} t={t} host={host} vocalBefore={settings.vocalBeforeAnalysis} onVocalBeforeChange={(v) => update({ vocalBeforeAnalysis: v })} threads={settings.vocalThreads} />
}
