import type { LangSetting } from '../../i18n/i18n'
import type { ThemeSetting } from '../settings'
import { UI_SCALES } from '../../constants/ui'
import { check, choice, defineItems, value } from './define'

/** 「表示」 */
export const display = defineItems('display', {
  theme: choice<ThemeSetting>('system', {
    label: 'settings.theme',
    options: [
      ['system', 'settings.themeSystem'],
      ['light', 'settings.themeLight'],
      ['dark', 'settings.themeDark'],
    ],
  }),
  // スマホの画面。new は新しい画面（選択したときの編集の列、両端のつまみ、なぞるとスクロール）、classic は以前の画面
  mobileUi: choice<'new' | 'classic'>('new', {
    label: 'settings.mobileUi',
    help: 'settings.mobileUiHelp',
    options: [
      ['new', 'settings.mobileUiNew'],
      ['classic', 'settings.mobileUiClassic'],
    ],
  }),
  // スマホの新しい画面での範囲選択。drag はなぞって選択、longPress は長押しで選択（なぞるとスクロール）
  touchSelect: choice<'drag' | 'longPress'>('drag', {
    label: 'settings.touchSelect',
    options: [
      ['drag', 'settings.touchSelectDrag'],
      ['longPress', 'settings.touchSelectLongPress'],
    ],
  }),
  // 画面の大きさ（倍率）。文字、入力欄、ボタンなどをまとめて拡大縮小する（PevenMUI の setUiScale）
  uiScale: choice<number>(1, { label: 'settings.uiScale', help: 'settings.uiScaleHelp', values: UI_SCALES, format: (s) => `${Math.round(s * 100)}%` }),
  // レベルメーター（全体とトラックごと）を表示する
  showMeters: check(true, { label: 'settings.showMeters', help: 'settings.showMetersHelp' }),
  // ミニマップに再生位置の線を表示する（表示メニューにもある）
  minimapPlayhead: check(true, { label: 'menu.minimapPlayhead', help: 'settings.minimapPlayheadHelp' }),
  // 範囲をドラッグしている途中も、選択範囲の数値などを更新する（切ると離したときに更新。軽い）
  liveSelection: check(false, { label: 'settings.liveSelection', help: 'settings.liveSelectionHelp' }),
  // 表示言語（auto はブラウザの言語に従う。選択肢はアプリの言語から作るので画面は自前）
  language: value<LangSetting>('auto', { label: 'settings.language' }),
})

/** 表示メニューとツールバーで切り替えるもの（設定画面には出さない。label はメニューの名前で、useToggleItem が使う） */
export const view = defineItems(null, {
  // ピッチ帯に音符ブロック（音ごとの半音の高さ）を表示する
  showNotes: value(false, { label: 'menu.notes' }),
  // ピッチ帯にピッチの線を表示する（音符ブロックとどちらかは表示する）
  showPitchLine: value(true, { label: 'menu.pitchLine' }),
  // ピッチを波形の帯に重ねる（オーバーパネル）
  overlayPitch: value(false, { label: 'menu.overlayPitch' }),
  // 波形の下にミニマップを表示する（オフなら従来のスクロールバー）
  minimap: value(true, { label: 'menu.minimap' }),
  // 再生中、再生位置が画面の外に出たら表示範囲を追従させる（ツールバーのボタンで切り替える）
  followPlayhead: value(true, { label: 'wave.follow' }),
})
