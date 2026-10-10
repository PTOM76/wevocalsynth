// 設定画面の分類の並びと、検索の対象
import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'
import { ACTIONS } from './keymap'
import { canPickFiles } from 'pevenmui/web'
import { GROUPS } from './items'
import { searchKeys, type AnyItem } from './items/define'

/** 設定画面の分類 */
export type Category = 'project' | 'general' | 'edit' | 'keys' | 'file' | 'display' | 'process' | 'pitch' | 'tempo' | 'vocal' | 'addons' | 'data' | 'debug' | 'debugAudio' | 'experimental' | 'diagnose'
/** 並び順と親子（親のない分類と、その下のサブアイテム） */
const TREE: [Category, Category?][] = [
  ['project'],
  ['general'],
  ['edit', 'general'],
  ['keys', 'general'],
  ['file', 'general'],
  ['display'],
  ['process'],
  ['pitch', 'process'],
  ['tempo', 'process'],
  ['vocal', 'process'],
  ['addons'],
  ['data'],
  ['debug'],
  ['debugAudio', 'debug'],
  ['experimental', 'debug'],
  ['diagnose', 'debug'],
]

/**
 * 設定の検索の対象のうち、定義（items/）にないもの: グループ名と、自前の画面の項目の訳文キー。
 * 定義のある項目の名前、説明、選択肢は searchIndex() で自動で入る
 */
const INDEX: Record<Category, MessageKey[]> = {
  project: ['settings.groupProject', 'project.name', 'settings.bpm', 'settings.beatsPerBar', 'settings.beatOffset'],
  general: [
    'settings.groupStartup',
    'settings.groupOutput', 'settings.outputDevice', 'settings.outputDeviceHelp',
    'settings.groupRecord',
    'settings.groupUpdate', 'update.check',
  ],
  edit: [
    'settings.groupHistory',
    'settings.groupInput',
  ],
  keys: [
    'settings.groupMouse',
    'settings.groupShortcuts', ...ACTIONS.map((a) => a.label),
  ],
  file: ['settings.groupFile'],
  display: ['settings.groupAppearance'],
  process: [
    'settings.groupDefaultAlgorithm',
    'settings.groupProcess',
  ],
  pitch: ['settings.groupPitch'],
  tempo: ['settings.groupTempo'],
  vocal: [
    'settings.groupVocal',
    'settings.groupAddons', 'settings.addonsMoved', 'settings.openAddons',
  ],
  addons: ['settings.groupAddonVocal', 'settings.groupAddonAnalyzer', 'settings.groupAddonConverter', 'addon.modelStandard', 'addon.modelLight', 'addon.modelPrecise', 'addon.modelVocalHq', 'addon.modelInstHq', 'addon.modelLead', 'addon.analyzer', 'addon.converter'],
  data: [
    'settings.groupData', 'data.work', 'data.workHelp', 'data.cache', 'data.cacheHelp', 'data.addons',
    'data.settings', 'data.settingsHelp', 'data.all', 'data.persist', 'data.persistHelp',
  ],
  debug: ['settings.groupDebug'],
  debugAudio: ['settings.groupDebugAudio'],
  experimental: ['settings.groupExperimental'],
  diagnose: ['settings.groupDiagnose', 'settings.extractDiagnose', 'settings.extractDiagnoseHelp'],
}

/** 分類の検索の対象（手で書いたものと、定義から集めたもの） */
function searchIndex(c: Category): MessageKey[] {
  const fromItems = GROUPS.filter((g) => g.page === c).flatMap((g) => (Object.values(g.items) as AnyItem[]).flatMap((i) => searchKeys(i)))
  return [...new Set([...INDEX[c], ...fromItems])]
}

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文）。「ファイル」は File System Access API が使えるブラウザだけ出す */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  return TREE.filter(([c]) => c !== 'file' || canPickFiles()).map(([c, parent]) => ({ id: c, label: t(`settings.cat.${c}`), texts: searchIndex(c).map((k) => t(k)), parent }))
}
