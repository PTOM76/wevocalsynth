// 設定の項目の定義（開発者向け、音声処理、試験的機能）
import type { WindowMode } from 'pevenmui'
import type { PickerMode } from 'pevenmui/web'
import { check, choice, defineItems, value } from './define'

/** 「開発者向け」 */
export const debug = defineItems('debug', {
  // デバッグ表示（FPS など。Ctrl+Shift+D でも切り替え）
  showDebug: check(false, { label: 'settings.showDebug', help: 'settings.showDebugHelp' }),
  // 開発版の更新（バージョンが同じでコミットだけ違う版）も知らせる
  devUpdates: check(false, { label: 'settings.devUpdates', help: 'settings.devUpdatesHelp' }),
  // ステータスバーに、選択範囲を WAV で保存するボタンを表示する
  showMaterialButton: check(false, { label: 'settings.showMaterialButton', help: 'settings.showMaterialButtonHelp' }),
  // ファイル選択の方式。auto はパソコンだけ File System Access API を使う
  filePicker: choice<PickerMode>('auto', {
    label: 'settings.filePicker',
    help: 'settings.filePickerHelp',
    options: [
      ['auto', 'settings.filePickerAuto'],
      ['api', 'settings.filePickerApi'],
      ['input', 'settings.filePickerInput'],
    ],
  }),
  // ダイアログの出し方（今は設定画面のみ）。auto は PWA かつ Chromium 系ならポップアップ、ほかはダイアログ。選択肢に訳さない名前があるので画面は自前
  dialogWindow: value<WindowMode | 'auto'>('auto', { label: 'settings.dialogWindow' }),
})

/** 「開発者向け」→「音声」 */
export const debugAudio = defineItems('debugAudio', {
  // フォルマント補正で速い対数と指数の近似を使う（切ると標準の関数。聴き比べ用）
  fastMath: check(true, { label: 'settings.fastMath', help: 'settings.fastMathHelp' }),
  // ループ試聴で、断片の読み始めを前の断片とそろえる（位置合わせ）。切ると従来の方式
  realtimeAlign: check(true, { label: 'settings.realtimeAlign', help: 'settings.realtimeAlignHelp' }),
  // 継ぎ目（範囲の差し戻し、貼り付け、切り取り）のクロスフェード長（ms）。聴き比べて既定を決めるため開発者向けに置く
  spliceFadeMs: choice<number>(5, { label: 'settings.spliceFade', help: 'settings.spliceFadeHelp', values: [5, 10, 20], format: (ms) => `${ms} ms` }),
  // 止めている間は AudioContext を一時停止する（iOS で音が出ないときの切り分け用。wevocal-lib の web/src/playback.ts）
  suspendWhenStopped: check(true, { label: 'settings.suspendWhenStopped', help: 'settings.suspendWhenStoppedHelp' }),
  // iOS のオーディオセッションを playback にする（消音スイッチでも鳴る）
  playbackSession: check(true, { label: 'settings.playbackSession', help: 'settings.playbackSessionHelp' }),
})

/** 「開発者向け」→「試験的機能」 */
export const experimental = defineItems('experimental', {
  // 試験的な処理方式（SMS、愛称 Specraw）を選択肢に表示する
  showExperimentalAlgorithms: check(false, { label: 'settings.showExperimentalAlgorithms', help: 'settings.showExperimentalAlgorithmsHelp' }),
  // 「和音を分ける」（試作）をメニューに表示する
  showVoiceSplit: check(false, { label: 'settings.showVoiceSplit', help: 'settings.showVoiceSplitHelp' }),
  // 声から一音を作る（試験的。memo/kana-voice.md）
  showKanaVoice: check(false, { label: 'settings.showKanaVoice', help: 'settings.showKanaVoiceHelp' }),
  // 声から五十音を作るとき、響きを動かす強さ（%）。弱めると母音らしさと引き換えに元の声質が残る
  kanaStrength: choice<number>(100, { label: 'settings.kanaStrength', help: 'settings.kanaStrengthHelp', values: [50, 70, 85, 100], format: (p) => `${p}%` }),
  // 長い音の加工を、区間に分けて複数の Worker で並列に行う（試験的。dsp/src/segment.rs）
  parallelProcess: check(false, { label: 'settings.parallelProcess', help: 'settings.parallelProcessHelp' }),
  // 追加機能を、選んだフォルダーに保存する（試験的。Chrome、Edge。memo/addon-folder.md）。フォルダーは AddonFolderRow で選ぶ
  addonFolder: check(false, { label: 'settings.addonFolder', help: 'settings.addonFolderHelp' }),
})
