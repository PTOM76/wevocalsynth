import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'
import { ACTIONS } from './keymap'
import { canPickFiles } from 'pevenmui/web'

/** 設定画面の分類 */
export type Category = 'project' | 'general' | 'edit' | 'keys' | 'file' | 'display' | 'process' | 'pitch' | 'tempo' | 'vocal' | 'data' | 'debug' | 'debugAudio' | 'experimental' | 'diagnose'
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
  ['data'],
  ['debug'],
  ['debugAudio', 'debug'],
  ['experimental', 'debug'],
  ['diagnose', 'debug'],
]

/**
 * 設定の検索の対象: 分類ごとのグループ名・項目名・説明文の訳文キー。
 * SettingsDialog の各ページ（と DataSection / AddonSection）に項目を足したら、ここにも足す
 */
const INDEX: Record<Category, MessageKey[]> = {
  project: ['settings.groupProject', 'project.name', 'settings.bpm', 'settings.beatsPerBar', 'settings.beatOffset'],
  general: [
    'settings.groupStartup', 'settings.autoRestore', 'settings.autoRestoreHelp', 'settings.confirmClose', 'settings.confirmCloseHelp',
    'settings.groupOutput', 'settings.outputDevice', 'settings.outputDeviceHelp',
    'settings.groupRecord', 'settings.recordEcho', 'settings.recordNoise', 'settings.recordAutoGain', 'settings.recordHelp',
    'settings.groupUpdate', 'update.check',
  ],
  edit: [
    'settings.groupHistory', 'settings.keepOriginal', 'settings.keepOriginalHelp', 'settings.historyLimit', 'settings.historyMemory',
    'settings.groupInput', 'settings.sliderReset', 'settings.seekAfterInsert',
  ],
  keys: [
    'settings.groupMouse', 'settings.wheelZoom', 'settings.wheelZoomCtrl', 'settings.wheelZoomWheel',
    'settings.groupShortcuts', 'settings.ctrlS', ...ACTIONS.map((a) => a.label),
  ],
  file: ['settings.groupFile', 'settings.rememberFolder', 'settings.rememberFolderHelp', 'settings.startFolder', 'settings.recentFiles', 'settings.recentFilesHelp'],
  display: ['settings.groupAppearance', 'settings.theme', 'settings.uiScale', 'settings.uiScaleHelp', 'settings.mobileUi', 'settings.mobileUiHelp', 'settings.touchSelect', 'settings.language', 'settings.showMeters', 'settings.showMetersHelp', 'menu.minimapPlayhead', 'settings.minimapPlayheadHelp', 'settings.liveSelection', 'settings.liveSelectionHelp'],
  process: [
    'settings.groupDefaultAlgorithm', 'settings.vocalAlgorithm', 'settings.instrumentAlgorithm', 'settings.showLegacyAlgorithms', 'settings.showLegacyAlgorithmsHelp',
    'settings.groupProcess', 'settings.initialMode', 'settings.saveMemory', 'settings.saveMemoryHelp',
  ],
  pitch: ['settings.groupPitch', 'settings.flattenStrength', 'settings.flattenStrengthHelp', 'settings.f0MinHz', 'settings.f0MaxHz', 'settings.f0Voicing', 'settings.f0SilenceDb'],
  tempo: [
    'settings.groupTempo', 'settings.autoTempo', 'settings.autoTempoHelp', 'settings.defaultBpm', 'settings.defaultBpmHelp', 'settings.showBeatGrid', 'settings.tempoStretch', 'settings.tempoStretchHelp',
  ],
  vocal: [
    'settings.groupVocal', 'settings.vocalModel', 'settings.vocalFresh', 'settings.vocalFreshHelp', 'settings.vocalGpu', 'settings.vocalGpuHelp', 'settings.vocalKeepHighBand', 'settings.vocalKeepHighBandHelp', 'settings.vocalMemory', 'settings.vocalMemoryHelp',
    'settings.groupAddons', 'addon.modelStandard', 'addon.modelLight', 'addon.modelPrecise',
  ],
  data: [
    'settings.groupData', 'data.work', 'data.workHelp', 'data.cache', 'data.cacheHelp', 'data.addons',
    'data.settings', 'data.settingsHelp', 'data.all', 'data.persist', 'data.persistHelp',
  ],
  debug: ['settings.groupDebug', 'settings.showDebug', 'settings.showDebugHelp', 'settings.devUpdates', 'settings.devUpdatesHelp', 'settings.showMaterialButton', 'settings.showMaterialButtonHelp', 'settings.filePicker', 'settings.filePickerHelp', 'settings.dialogWindow'],
  debugAudio: [
    'settings.groupDebugAudio', 'settings.fastMath', 'settings.fastMathHelp', 'settings.realtimeAlign', 'settings.realtimeAlignHelp',
    'settings.spliceFade', 'settings.spliceFadeHelp', 'settings.suspendWhenStopped', 'settings.suspendWhenStoppedHelp', 'settings.playbackSession', 'settings.playbackSessionHelp',
  ],
  experimental: ['settings.groupExperimental', 'settings.showExperimentalAlgorithms', 'settings.showExperimentalAlgorithmsHelp', 'settings.showVoiceSplit', 'settings.showVoiceSplitHelp'],
  diagnose: ['settings.groupDiagnose', 'settings.extractDiagnose', 'settings.extractDiagnoseHelp'],
}

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文）。「ファイル」は File System Access API が使えるブラウザだけ出す */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  return TREE.filter(([c]) => c !== 'file' || canPickFiles()).map(([c, parent]) => ({ id: c, label: t(`settings.cat.${c}`), texts: INDEX[c].map((k) => t(k)), parent }))
}
