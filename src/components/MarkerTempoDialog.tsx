// マーカーからのテンポを決めるダイアログ（部品は wevocal-lib。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { MarkerTempoDialog as LibDialog } from 'wevocal-lib/react'
import { useT } from '../i18n/i18n'

export default function MarkerTempoDialog(p: Omit<ComponentProps<typeof LibDialog>, 't'>) {
  const t = useT()
  return <LibDialog {...p} t={t} />
}
