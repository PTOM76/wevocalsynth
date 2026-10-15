// FX の列のダイアログ（部品は wevocal-lib の FxChainDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { FxChainDialog as LibFxChainDialog } from 'wevocal-lib/react'
import { i18n, useT } from '../i18n/i18n'

export default function FxChainDialog(p: Omit<ComponentProps<typeof LibFxChainDialog>, 't' | 'lang'>) {
  const t = useT()
  return <LibFxChainDialog {...p} t={t} lang={i18n.useLang()} />
}
