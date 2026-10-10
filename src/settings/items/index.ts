// 設定の項目をまとめ、型と既定値を作る（PevenMUI の collectItems）
import { collectItems, type SettingsOf, type ItemsOf } from 'pevenmui'
import { debug, debugAudio, experimental } from './debug'
import type { Item, ItemGroup } from './define'
import { display, view } from './display'
import { edit, file, general, keys } from './general'
import { pitch, process, tempo, vocal } from './process'
import { stored } from './stored'

/** すべての項目の集まり。設定を足すときは、分類のファイルに 1 行足す */
export const GROUPS = [general, edit, keys, file, display, view, process, pitch, tempo, vocal, debug, debugAudio, experimental, stored] as const

const collected = collectItems(GROUPS)
/** 項目の定義（名前から引く） */
export const ITEMS = collected.items
/** アプリの設定 */
export type Settings = SettingsOf<ItemsOf<typeof GROUPS>>
export const DEFAULT_SETTINGS: Settings = collected.defaults

export type { Item, ItemGroup }
