// トラックのグラフィック EQ のダイアログ（部品は wevocal-lib の EqDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { EqDialog as LibEqDialog } from 'wevocal-lib/react'
import { useT } from '../../i18n/i18n'

export default function EqDialog(p: Omit<ComponentProps<typeof LibEqDialog>, 't'>) {
  const t = useT()
  return <LibEqDialog {...p} t={t} />
}
