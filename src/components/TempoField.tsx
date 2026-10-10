// BPM の表示と入力（部品は PevenMUI の TempoField。WeVocal Studio と共通）
import { TempoField as PevenTempoField, type TempoFieldProps } from 'pevenmui'
import { useT } from '../i18n/i18n'

/** BPM の表示（ステータスバー、スマホの波形の下）。押すと候補、2 倍、半分、タップ、数値の入力、再解析ができる */
export default function TempoField(p: Omit<TempoFieldProps, 'labels'>) {
  const t = useT()
  return <PevenTempoField {...p} labels={{ tap: t('tempo.tap'), tapHint: t('tempo.tapHint'), candidates: t('tempo.candidates'), analyze: t('tempo.analyze'), analyzing: t('common.analyzing') }} />
}
