import { matches } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'

/** 設定画面の分類 */
export type Category = 'project' | 'general' | 'display' | 'pitch' | 'tempo' | 'keys' | 'vocal' | 'data' | 'debug'
export const CATEGORIES: Category[] = ['project', 'general', 'display', 'pitch', 'tempo', 'keys', 'vocal', 'data', 'debug']

/**
 * 設定の検索の対象: 分類ごとのグループ名・項目名・説明文の訳文キー。
 * SettingsDialog の各ページ（と DataSection / AddonSection）に項目を足したら、ここにも足す
 */
const INDEX: Record<Category, MessageKey[]> = {
  project: ['settings.groupProject', 'project.name', 'settings.bpm', 'settings.beatsPerBar', 'settings.beatOffset'],
  general: [
    'settings.groupStartup', 'settings.autoRestore', 'settings.autoRestoreHelp',
    'settings.groupHistory', 'settings.historyLimit', 'settings.historyMemory',
    'settings.groupProcess', 'settings.initialMode',
    'settings.groupUpdate', 'update.check',
  ],
  display: ['settings.groupAppearance', 'settings.theme', 'settings.language', 'settings.showMeters', 'settings.showMetersHelp'],
  pitch: ['settings.groupPitch', 'settings.f0MinHz', 'settings.f0MaxHz', 'settings.f0Voicing', 'settings.f0SilenceDb'],
  tempo: [
    'settings.groupTempo', 'settings.autoTempo', 'settings.autoTempoHelp', 'settings.showBeatGrid',
  ],
  keys: ['settings.groupShortcuts', 'settings.ctrlS'],
  vocal: [
    'settings.groupVocal', 'settings.vocalModel', 'settings.vocalGpu', 'settings.vocalGpuHelp', 'settings.vocalKeepHighBand', 'settings.vocalKeepHighBandHelp',
    'settings.groupAddons', 'addon.modelStandard', 'addon.modelLight', 'addon.modelPrecise',
  ],
  data: [
    'settings.groupData', 'data.work', 'data.workHelp', 'data.cache', 'data.cacheHelp', 'data.addons',
    'data.settings', 'data.settingsHelp', 'data.all', 'data.persist', 'data.persistHelp',
  ],
  debug: ['settings.groupDebug', 'settings.showDebug', 'settings.showDebugHelp'],
}

/** 検索語に一致する項目がある分類（分類名そのものの一致も含む）。検索語が空ならすべて */
export function matchCategories(query: string, t: (key: MessageKey) => string): Category[] {
  if (!query.trim()) return CATEGORIES
  return CATEGORIES.filter((c) => matches(t(`settings.cat.${c}`), query) || INDEX[c].some((k) => matches(t(k), query)))
}
