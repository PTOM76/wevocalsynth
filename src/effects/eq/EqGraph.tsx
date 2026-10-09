// グラフィック EQ のグラフ。部品は wevocal-lib/react に移した（WeVocal Studio と共通）。ここではテーマの色と文言を渡すだけ
import { usePalette } from 'pevenmui'
import { EqGraph as Graph } from 'wevocal-lib/react'
import type { TrackEq } from './eq'
import { useT } from '../../i18n/i18n'

export default function EqGraph(p: { eq: TrackEq; onChange: (gains: number[]) => void }) {
  const t = useT()
  const { pal } = usePalette()
  return (
    <Graph
      eq={p.eq}
      onChange={p.onChange}
      label={t('eq.graph')}
      colors={{ background: pal.action.hover, divider: pal.divider, text: pal.text.primary, textSecondary: pal.text.secondary, line: pal.primary.main, disabled: pal.text.disabled }}
    />
  )
}
