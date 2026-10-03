import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'
import { canPickFiles } from 'pevenmui/web'

/** 設定画面の分類 */
export type Category = 'project' | 'general' | 'edit' | 'file' | 'display' | 'process' | 'pitch' | 'tempo' | 'vocal' | 'data' | 'debug'
/** 並び順と親子（親のない分類と、その下のサブアイテム） */
const TREE: [Category, Category?][] = [
  ['project'],
  ['general'],
  ['edit', 'general'],
  ['file', 'general'],
  ['display'],
  ['process'],
  ['pitch', 'process'],
  ['tempo', 'process'],
  ['vocal', 'process'],
  ['data'],
  ['debug'],
]

/**
 * 設定の検索の対象: 分類ごとのグループ名・項目名・説明文の訳文キー。
 * SettingsDialog の各ページ（と DataSection / AddonSection）に項目を足したら、ここにも足す
 */
const INDEX: Record<Category, MessageKey[]> = {
  project: ['settings.groupProject', 'project.name', 'settings.bpm', 'settings.beatsPerBar', 'settings.beatOffset'],
  general: [
    'settings.groupStartup', 'settings.autoRestore', 'settings.autoRestoreHelp', 'settings.confirmClose', 'settings.confirmCloseHelp',
    'settings.groupUpdate', 'update.check',
  ],
  edit: [
    'settings.groupHistory', 'settings.keepOriginal', 'settings.keepOriginalHelp', 'settings.historyLimit', 'settings.historyMemory',
    'settings.groupInput', 'settings.sliderReset', 'settings.seekAfterInsert', 'settings.wheelZoom', 'settings.wheelZoomCtrl', 'settings.wheelZoomWheel',
    'settings.groupShortcuts', 'settings.ctrlS',
  ],
  file: ['settings.groupFile', 'settings.rememberFolder', 'settings.rememberFolderHelp', 'settings.startFolder', 'settings.recentFiles', 'settings.recentFilesHelp'],
  display: ['settings.groupAppearance', 'settings.theme', 'settings.language', 'settings.showMeters', 'settings.showMetersHelp', 'settings.liveSelection', 'settings.liveSelectionHelp'],
  process: [
    'settings.groupDefaultAlgorithm', 'settings.vocalAlgorithm', 'settings.instrumentAlgorithm', 'settings.showLegacyAlgorithms', 'settings.showLegacyAlgorithmsHelp',
    'settings.groupProcess', 'settings.initialMode', 'settings.saveMemory', 'settings.saveMemoryHelp',
  ],
  pitch: ['settings.groupPitch', 'settings.f0MinHz', 'settings.f0MaxHz', 'settings.f0Voicing', 'settings.f0SilenceDb'],
  tempo: [
    'settings.groupTempo', 'settings.autoTempo', 'settings.autoTempoHelp', 'settings.defaultBpm', 'settings.defaultBpmHelp', 'settings.showBeatGrid', 'settings.tempoStretch', 'settings.tempoStretchHelp',
  ],
  vocal: [
    'settings.groupVocal', 'settings.vocalModel', 'settings.vocalFresh', 'settings.vocalFreshHelp', 'settings.vocalGpu', 'settings.vocalGpuHelp', 'settings.vocalKeepHighBand', 'settings.vocalKeepHighBandHelp',
    'settings.groupAddons', 'addon.modelStandard', 'addon.modelLight', 'addon.modelPrecise',
  ],
  data: [
    'settings.groupData', 'data.work', 'data.workHelp', 'data.cache', 'data.cacheHelp', 'data.addons',
    'data.settings', 'data.settingsHelp', 'data.all', 'data.persist', 'data.persistHelp',
  ],
  debug: ['settings.groupDebug', 'settings.showDebug', 'settings.showDebugHelp', 'settings.spliceFade', 'settings.spliceFadeHelp', 'settings.realtimeAlign', 'settings.realtimeAlignHelp', 'settings.fastMath', 'settings.fastMathHelp', 'settings.filePicker', 'settings.filePickerHelp', 'settings.devUpdates', 'settings.devUpdatesHelp', 'settings.suspendWhenStopped', 'settings.suspendWhenStoppedHelp', 'settings.playbackSession', 'settings.playbackSessionHelp', 'settings.vocalMemory', 'settings.vocalMemoryHelp', 'settings.extractDiagnose', 'settings.extractDiagnoseHelp', 'settings.dialogWindow'],
}

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文）。「ファイル」は File System Access API が使えるブラウザだけ出す */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  return TREE.filter(([c]) => c !== 'file' || canPickFiles()).map(([c, parent]) => ({ id: c, label: t(`settings.cat.${c}`), texts: INDEX[c].map((k) => t(k)), parent }))
}
