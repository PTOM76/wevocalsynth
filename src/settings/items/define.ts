// 設定の項目を定義する関数（check、choice、number、value）。仕組みは PevenMUI の settingItems（WeVocal Studio と共通）。ここは訳文のキーと分類の型を決めるだけ
import { settingItems, type AnyItem as PevenAnyItem, type Item as PevenItem, type ItemGroup as PevenItemGroup } from 'pevenmui'
import type { MessageKey } from '../../i18n/i18n'
import type { Category } from '../settingsSearch'

export const { check, choice, number, value, defineItems } = settingItems<MessageKey, Category>()
export type Item<T> = PevenItem<T, MessageKey>
export type AnyItem = PevenAnyItem<MessageKey>
export type ItemGroup<I extends Record<string, AnyItem>> = PevenItemGroup<I, Category>
export { searchKeys, type ValueOf } from 'pevenmui'
