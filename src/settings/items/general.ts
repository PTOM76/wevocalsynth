import type { StartFolder } from 'pevenmui/web'
import type { WheelZoom } from 'wevocal-lib/react'
import type { CtrlSAction } from '../settings'
import type { KeymapOverrides } from '../keymap'
import { check, choice, defineItems, number, value } from './define'

/** 「全般」 */
export const general = defineItems('general', {
  // 作業状態を自動保存し、次に開いたとき復元する
  autoRestore: check(true, { label: 'settings.autoRestore', help: 'settings.autoRestoreHelp' }),
  // 自動保存を切っていて PWA として開いているとき、未保存の変更があれば閉じる前に確認する
  confirmClose: check(true, { label: 'settings.confirmClose', help: 'settings.confirmCloseHelp' }),
  // 音声の出力先のデバイス ID（'' は既定の出力。OutputDeviceRow）
  outputDevice: value(''),
  // 録音のブラウザの加工（声を素材にするため、既定はすべてオフ）
  recordEchoCancellation: check(false, { label: 'settings.recordEcho' }),
  recordNoiseSuppression: check(false, { label: 'settings.recordNoise' }),
  recordAutoGain: check(false, { label: 'settings.recordAutoGain', help: 'settings.recordHelp' }),
})

/** 「編集」 */
export const edit = defineItems('edit', {
  // 原音（加工前の音声）を持つ。オフなら加工を適用するたびに、その結果を新しい原音にする
  keepOriginal: check(true, { label: 'settings.keepOriginal', help: 'settings.keepOriginalHelp' }),
  // 元に戻せる段数
  historyLimit: number(50, { label: 'settings.historyLimit', min: 1, max: 500, step: 1 }),
  // 元に戻す履歴が使うメモリの上限（MB）。超えたら古い段から捨てる
  historyMemoryMb: number(512, { label: 'settings.historyMemory', min: 64, max: 4096, step: 64, unit: 'MB' }),
  // 加工と音量のスライダーをダブルクリックで既定値に戻す
  sliderDoubleClickReset: check(true, { label: 'settings.sliderReset' }),
  // 貼り付けと無音の挿入のあと、再生位置を入れた範囲の終わりへ移す
  seekAfterInsert: check(true, { label: 'settings.seekAfterInsert' }),
})

/** 「キーとマウス」 */
export const keys = defineItems('keys', {
  // ホイールでの拡大縮小の割り当て
  wheelZoom: choice<WheelZoom>('ctrl', {
    label: 'settings.wheelZoom',
    options: [
      ['ctrl', 'settings.wheelZoomCtrl'],
      ['wheel', 'settings.wheelZoomWheel'],
    ],
  }),
  // Ctrl+S で行うこと。もう一方は Ctrl+Shift+S になる
  ctrlS: choice<CtrlSAction>('project', {
    label: 'settings.ctrlS',
    options: [
      ['project', 'settings.ctrlSProject'],
      ['export', 'settings.ctrlSExport'],
    ],
  }),
  // キーボードショートカットのうち、既定から変えたもの（settings/keymap.ts）
  keymap: value<KeymapOverrides>({}),
})

/** 「ファイル」 */
export const file = defineItems('file', {
  // 開くフォルダーと保存するフォルダーを用途ごとに覚える（Chrome、Edge。project/fileAccess.ts）
  rememberFolder: check(true, { label: 'settings.rememberFolder', help: 'settings.rememberFolderHelp' }),
  // 保存先の画面で最初に開くフォルダー
  startFolder: choice<StartFolder>('downloads', {
    label: 'settings.startFolder',
    options: [
      ['downloads', 'settings.folderDownloads'],
      ['documents', 'settings.folderDocuments'],
      ['desktop', 'settings.folderDesktop'],
      ['music', 'settings.folderMusic'],
    ],
  }),
  // 最近使用したファイルを記録する
  recentFiles: check(true, { label: 'settings.recentFiles', help: 'settings.recentFilesHelp' }),
})
