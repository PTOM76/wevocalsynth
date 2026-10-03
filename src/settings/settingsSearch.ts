import type { SettingsCategory } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'
import { canPickFiles } from '../project/fileAccess'

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
    'settings.groupStartup', 'settings.autoRestore', 'settings.autoRestoreHelp', 'settings.confirmClose', 'settings.confirmCloseHelp',
    'settings.groupHistory', 'settings.historyLimit', 'settings.historyMemory',
    'settings.groupInput', 'settings.sliderReset', 'settings.seekAfterInsert', 'settings.wheelZoom', 'settings.wheelZoomCtrl', 'settings.wheelZoomWheel',
    // 「ファイル」は File System Access API が使えるときだけ出す（FILE_KEYS）
    'settings.groupProcess', 'settings.initialMode', 'settings.saveMemory', 'settings.saveMemoryHelp',
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
  debug: ['settings.groupDebug', 'settings.showDebug', 'settings.showDebugHelp', 'settings.spliceFade', 'settings.spliceFadeHelp', 'settings.realtimeAlign', 'settings.realtimeAlignHelp', 'settings.fastMath', 'settings.fastMathHelp', 'settings.filePicker', 'settings.filePickerHelp', 'settings.devUpdates', 'settings.devUpdatesHelp', 'settings.suspendWhenStopped', 'settings.suspendWhenStoppedHelp', 'settings.playbackSession', 'settings.playbackSessionHelp', 'settings.vocalMemory', 'settings.vocalMemoryHelp', 'settings.extractDiagnose', 'settings.extractDiagnoseHelp', 'settings.dialogWindow'],
}

/** 「全般」の「ファイル」の項目（開く場所と保存先の記憶、最近使用したファイル）。使えないブラウザでは画面にも検索にも出さない */
const FILE_KEYS: MessageKey[] = ['settings.groupFile', 'settings.rememberFolder', 'settings.rememberFolderHelp', 'settings.startFolder', 'settings.recentFiles', 'settings.recentFilesHelp']

/** 設定画面に渡す分類の一覧（名前と、検索の対象の訳文） */
export function settingsCategories(t: (key: MessageKey) => string): SettingsCategory<Category>[] {
  const keys = (c: Category) => (c === 'general' && canPickFiles() ? [...INDEX[c], ...FILE_KEYS] : INDEX[c])
  return CATEGORIES.map((c) => ({ id: c, label: t(`settings.cat.${c}`), texts: keys(c).map((k) => t(k)) }))
}
