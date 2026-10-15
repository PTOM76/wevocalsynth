// 編集の履歴のダイアログ（部品は PevenMUI の HistoryDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { HistoryDialog as PevenHistoryDialog } from 'pevenmui'
import { useT } from '../i18n/i18n'

export default function HistoryDialog(p: Omit<ComponentProps<typeof PevenHistoryDialog>, 'text'>) {
  const t = useT()
  return <PevenHistoryDialog {...p} text={{ title: t('history.title'), opened: t('history.opened'), current: t('history.current') }} />
}
