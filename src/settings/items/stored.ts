// 設定の項目の定義（画面の操作で覚えておく値）
import type { Preset } from '../../components/PresetMenu'
import { DEFAULT_VIDEO_PREFS, type VideoExportPrefs } from '../../components/videoPrefs'
import { defineItems, value } from './define'

/** 画面の操作で覚えておく値（設定画面には出さない） */
export const stored = defineItems(null, {
  // 録音の入力元（'' は既定の入力）
  inputDevice: value(''),
  // 書き出し（フォルダーへの保存、外へのドラッグも）の仕上げ: ノーマライズと、両端のフェードの長さ（ms、0 でなし）
  exportNormalize: value(false),
  exportFadeMs: value(0),
  // 動画の書き出しで前に選んだもの（components/VideoExportDialog.tsx）
  exportVideo: value<VideoExportPrefs>(DEFAULT_VIDEO_PREFS),
  // 加工のプリセット（components/PresetMenu.tsx）
  presets: value<Preset[]>([]),
})
