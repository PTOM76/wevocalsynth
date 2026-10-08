import type { MessageKey } from '../../i18n/i18n'
import type { Category } from '../settingsSearch'

/** 選択肢の値（Choice には文字列で渡す） */
type OptionValue = string | number

/** 設定の項目の定義。kind で設定画面の行の形が決まる（value は画面を自前で作るか、画面に出さない） */
export type Item<T> =
  | { kind: 'check'; default: T; label: MessageKey; help?: MessageKey }
  | { kind: 'choice'; default: T; label: MessageKey; help?: MessageKey; options: readonly (readonly [T, MessageKey])[] }
  | { kind: 'choice'; default: T; label: MessageKey; help?: MessageKey; values: readonly T[]; format: (v: T) => string }
  | { kind: 'number'; default: T; label: MessageKey; help?: MessageKey; min: number; max: number; step: number; unit?: string; round?: (v: number) => number }
  | { kind: 'value'; default: T; label?: MessageKey; help?: MessageKey }

type Meta = { label: MessageKey; help?: MessageKey }

/** オンとオフの項目 */
export const check = (def: boolean, meta: Meta): Item<boolean> => ({ kind: 'check', default: def, ...meta })

/** 選択肢から選ぶ項目（選択肢の名前は訳文のキー） */
export function choice<T extends OptionValue>(def: NoInfer<T>, meta: Meta & { options: readonly (readonly [T, MessageKey])[] }): Item<T>
/** 選択肢から選ぶ項目（選択肢の名前は format で作る。100% や 5 ms など） */
export function choice<T extends OptionValue>(def: NoInfer<T>, meta: Meta & { values: readonly T[]; format: (v: T) => string }): Item<T>
export function choice<T extends OptionValue>(def: T, meta: Meta & object): Item<T> {
  return { kind: 'choice', default: def, ...meta } as Item<T>
}

/** 数値を入力する項目。round を省くと整数に丸める */
export const number = (def: number, meta: Meta & { min: number; max: number; step: number; unit?: string; round?: (v: number) => number }): Item<number> => ({
  kind: 'number',
  default: def,
  ...meta,
})

/** 画面を自前で作る項目と、画面に出さない項目（メニューの切り替え、覚えておく値など） */
export const value = <T>(def: T, meta: Partial<Meta> = {}): Item<T> => ({ kind: 'value', default: def, ...meta })

// format の引数があるため Item<T> は Item<unknown> に代入できない。集まりの制約には any を使う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyItem = Item<any>

/** 設定画面の分類（page）に属する項目の集まり。page が null なら設定画面に出さない */
export interface ItemGroup<I extends Record<string, AnyItem>> {
  page: Category | null
  items: I
}

export const defineItems = <I extends Record<string, AnyItem>>(page: Category | null, items: I): ItemGroup<I> => ({ page, items })

/** 項目の値の型 */
export type ValueOf<I> = I extends { default: infer T } ? T : never

/** 検索の対象にする訳文のキー（名前、説明、選択肢の名前） */
export function searchKeys(item: AnyItem): MessageKey[] {
  const keys: MessageKey[] = []
  if (item.label) keys.push(item.label)
  if (item.help) keys.push(item.help)
  if (item.kind === 'choice' && 'options' in item) keys.push(...item.options.map(([, k]) => k))
  return keys
}
