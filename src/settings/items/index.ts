import { debug, debugAudio, experimental } from './debug'
import type { AnyItem, Item, ItemGroup, ValueOf } from './define'
import { display, view } from './display'
import { edit, file, general, keys } from './general'
import { pitch, process, tempo, vocal } from './process'
import { stored } from './stored'

/** すべての項目の集まり。設定を足すときは、分類のファイルに 1 行足す */
export const GROUPS = [general, edit, keys, file, display, view, process, pitch, tempo, vocal, debug, debugAudio, experimental, stored] as const

type Groups = (typeof GROUPS)[number]
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never
type AllItems = UnionToIntersection<Groups['items']>

/** 項目の定義（名前から引く） */
export const ITEMS = Object.assign({}, ...GROUPS.map((g) => g.items)) as AllItems

/** アプリの設定 */
export type Settings = { [K in keyof AllItems]: ValueOf<AllItems[K]> }

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(ITEMS).map(([k, item]) => [k, (item as AnyItem).default])) as Settings

export type { Item, ItemGroup }
