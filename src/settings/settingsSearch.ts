import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'

/** 設定画面の分類 */
export type Category = 'project' | 'general' | 'defaults' | 'display' | 'pitch' | 'tempo' | 'keys' | 'vocal' | 'data' | 'debug'
export const CATEGORIES: Category[] = ['project', 'general', 'defaults', 'display', 'pitch', 'tempo', 'keys', 'vocal', 'data', 'debug']

/**
 * 設定の検索の対象: 分類ごとのグループ名・項目名・説明文の訳文キー。
 * SettingsDialog の各ページ（と DataSection / AddonSection）に項目を足したら、ここにも足す
 */
const INDEX: Record<Category, MessageKey[]> = {
  project: ['settings.groupProject', 'project.name', 'settings.bpm', 'settings.beatsPerBar', 'settings.beatOffset'],
  general: [
    'settings.groupStartup', 'settings.autoRestore', 'settings.autoRestoreHelp',
    'settings.groupHistory', 'settings.historyLimit', 'settings.historyMemory',
    'settings.groupInput', 'settings.sliderReset', 'settings.sliderResetHelp', 'settings.seekAfterInsert', 'settings.wheelZoom', 'settings.wheelZoomCtrl', 'settings.wheelZoomWheel',
    'settings.groupProcess', 'settings.initialMode',
    'settings.groupUpdate', 'update.check',
  ],
  defaults: [
    'settings.groupDefaultAlgorithm', 'settings.vocalAlgorithm', 'settings.instrumentAlgorithm', 'settings.showLegacyAlgorithms', 'settings.showLegacyAlgorithmsHelp',
    'settings.groupDefaultTempo', 'settings.defaultBpm', 'settings.defaultBpmHelp',
  ],
  display: ['settings.groupAppearance', 'settings.theme', 'settings.language', 'settings.showMeters', 'settings.showMetersHelp', 'settings.liveSelection', 'settings.liveSelectionHelp'],
  pitch: ['settings.groupPitch', 'settings.f0MinHz', 'settings.f0MaxHz', 'settings.f0Voicing', 'settings.f0SilenceDb'],
  tempo: [
    'settings.groupTempo', 'settings.autoTempo', 'settings.autoTempoHelp', 'settings.showBeatGrid', 'settings.tempoStretch', 'settings.tempoStretchHelp',
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
  debug: ['settings.groupDebug', 'settings.showDebug', 'settings.showDebugHelp', 'settings.spliceFade', 'settings.spliceFadeHelp', 'settings.realtimeAlign', 'settings.realtimeAlignHelp', 'settings.fastMath', 'settings.fastMathHelp', 'settings.suspendWhenStopped', 'settings.suspendWhenStoppedHelp', 'settings.playbackSession', 'settings.playbackSessionHelp', 'settings.dialogWindow'],
}

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文） */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  return CATEGORIES.map((c) => ({ id: c, label: t(`settings.cat.${c}`), texts: INDEX[c].map((k) => t(k)) }))
}
