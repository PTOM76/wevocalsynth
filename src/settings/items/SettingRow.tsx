// 項目の定義から設定画面の 1 行を作る
import { Check, Choice, Row } from 'pevenmui'
import { NumberInput } from '../../components/inspector/Inspector'
import type { MessageKey } from '../../i18n/i18n'
import type { AnyItem } from './define'
import { ITEMS, type Settings } from '.'

interface Props {
  name: keyof Settings
  draft: Settings
  set: (patch: Partial<Settings>) => void
  t: (key: MessageKey) => string
}

/** 項目の定義から設定画面の 1 行を作る（kind が value の項目は作らない） */
export default function SettingRow({ name, draft, set, t }: Props) {
  const item = ITEMS[name] as AnyItem
  const v = draft[name] as never
  const help = item.help && t(item.help)
  switch (item.kind) {
    case 'check':
      return <Check checked={v} onChange={(c) => set({ [name]: c })} label={t(item.label)} help={help} />
    case 'choice': {
      // 数値の選択肢も Choice には文字列で渡し、戻すときに数値にする
      const options: [string, string][] = 'options' in item ? item.options.map(([o, k]) => [String(o), t(k)]) : item.values.map((o) => [String(o), item.format(o)])
      const back = typeof item.default === 'number' ? Number : String
      return (
        <Row label={t(item.label)} help={help}>
          <Choice<string> value={String(v)} onChange={(c) => set({ [name]: back(c) })} options={options} />
        </Row>
      )
    }
    case 'number':
      return (
        <Row label={t(item.label)} help={help}>
          <NumberInput value={v} onChange={(n) => set({ [name]: (item.round ?? Math.round)(n) })} min={item.min} max={item.max} step={item.step} unit={item.unit} width={110} />
        </Row>
      )
    default:
      return null
  }
}
