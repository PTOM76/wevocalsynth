// メニューバーと右クリックメニューの並び（項目はコマンドの id。docs/DECISIONS.md の「メニューの構成」）
import type { MenuEntry } from 'pevenmui'
import type { CommandContext, CommandId } from '.'
import { opened, ready, selected } from './types'
import { pitchReady } from './tools'
import type { MessageKey } from '../i18n/i18n'

type T = (key: MessageKey, vars?: Record<string, string | number>) => string

/** サブメニュー。`enabled` を省くと押せる、`visible` を省くといつも表示する */
export interface MenuSub {
  label: MessageKey
  enabled?: (c: CommandContext) => boolean
  visible?: (c: CommandContext) => boolean
  items: MenuItem[]
}
/** 中身が状態で変わる部分（最近使用したファイルなど）を作る関数 */
export type MenuDynamic = (c: CommandContext, t: T) => MenuEntry[]
/** 並びの 1 つ。コマンドの id、区切り（'-'）、サブメニュー、中身が変わる部分 */
export type MenuItem = CommandId | '-' | MenuSub | MenuDynamic

/** 最近使用したファイル（File System Access API が使えるブラウザでだけ表示する） */
const recent: MenuDynamic = (c, t) => {
  const r = c.ed.recent
  if (!r.supported) return []
  const submenu: MenuEntry[] = r.names.length
    ? [...r.names.map((name, i): MenuEntry => ({ label: name, onClick: () => r.open(i) })), { divider: true }, { label: t('menu.recentClear'), onClick: r.clear }]
    : [{ label: t('menu.recentEmpty'), disabled: true, onClick: () => {} }]
  return [{ label: t('menu.recent'), disabled: c.ed.busy, submenu }]
}

/** 声から五十音を作る（試験的。設定の試験的機能で表示する）。素材の母音を選ぶ */
const kana: MenuDynamic = (c, t) =>
  c.settings.showKanaVoice
    ? [
        { label: t('kana.demoMenu'), disabled: !ready(c), submenu: (['a', 'i', 'u', 'e', 'o'] as const).map((v, i) => ({ label: t(`kana.from.${v}`), onClick: () => void c.ed.kanaDemo(i) })) },
      ]
    : []

const toNewTrack: MenuSub = { label: 'menu.toNewTrack', enabled: selected, items: ['copySelectionToTrack', 'moveSelectionToTrack'] }
const volume: MenuSub = { label: 'volume.title', enabled: ready, items: ['fadeIn', 'fadeOut', 'normalize', 'silence'] }
// ボーカル抽出と分離（選択範囲、なければ全体）。メニューバーでは「ツール」、右クリックでは編集の後ろ
const extract: MenuSub = { label: 'context.extract', enabled: ready, items: ['extractVocals', 'extractAccompaniment', '-', 'splitStems', 'splitLeadStems', 'splitInstrumentStems'] }
// 試験的機能（設定の「試験的機能」でオンにしたものだけ。どれもオフならサブメニューごと隠す）
const experimental: MenuSub = {
  label: 'menu.experimental',
  visible: (c) => c.settings.showVoiceSplit || c.settings.showKanaVoice,
  enabled: ready,
  items: ['splitVoicesByPitch', 'splitVoicesByVolume', kana],
}
// 一音ずつ切り出し（memo/kana-cut.md）。範囲を求めたあとの書き出しと並べる操作もまとめる
const kanaCut: MenuSub = { label: 'menu.kanaCut', enabled: ready, items: ['kanaCut', '-', 'exportMorae', 'exportUtau', 'lineUpMorae', '-', 'clearMorae'] }

/** メニューバー（スマホでは ⋮ のメニュー一覧） */
export const MENU_BAR: { label: MessageKey; accessKey: string; items: MenuItem[] }[] = [
  { label: 'menu.file', accessKey: 'F', items: ['open', recent, 'addTrack', 'saveProject', 'saveProjectAs', '-', 'exportAudio', 'exportVideo', '-', 'settings'] },
  {
    label: 'menu.edit',
    accessKey: 'E',
    items: [
      'undo', 'redo', 'history', '-',
      'cut', 'copy', 'paste', 'remove', 'trim', 'reverse', 'insertSilence', 'repeatSelection', toNewTrack, '-',
      'selectAll', 'selectSounds', 'clearSelection', '-',
      { label: 'menu.marker', enabled: opened, items: ['addMarker', 'renameMarker', 'markerTempo', 'removeMarker', 'clearMarkers'] },
      volume,
    ],
  },
  {
    label: 'menu.view',
    accessKey: 'V',
    items: [
      'spectrogram', 'wave', 'pitch', 'gain', 'formant', '-',
      'pitchLine', 'notes', 'overlayPitch', 'minimap', '-',
      'zoomIn', 'zoomOut', 'showAll', 'zoomSelection',
      { label: 'wave.vZoom', enabled: opened, items: ['vZoomIn', 'vZoomOut', 'vZoomReset'] },
      'followPlayhead',
    ],
  },
  { label: 'menu.play', accessKey: 'P', items: ['playPause', 'stop', 'playSelection', 'toggleLoop', '-', 'seekStart', 'seekEnd', 'prevMarker', 'nextMarker'] },
  {
    label: 'menu.track',
    accessKey: 'R',
    items: [
      'addTrack', 'duplicateTrack', 'trackFromOriginal', 'addEmptyTrack', 'copySelectionToTrack', 'moveSelectionToTrack', 'renameTrack', 'removeTrack', '-',
      'mute', 'solo', 'invert', 'eq', '-',
      'mergeDown', 'mergeAll',
    ],
  },
  // 編集メニューに入れすぎないよう、加工の道具（抽出、音声の作成）は「ツール」にまとめる
  { label: 'menu.tools', accessKey: 'T', items: [extract, experimental, '-', 'sampler', 'synth', 'record', '-', kanaCut] },
  { label: 'menu.help', accessKey: 'H', items: ['userGuide', 'shortcuts', '-', 'checkUpdate', 'licenses', 'about'] },
]

/** 波形の右クリック。上の段は 10 個前後にし、まとまりはサブメニューにする */
export const CONTEXT_MENU: MenuItem[] = [
  'playSelection', 'toggleLoop', '-',
  'cut', 'copy', 'paste', 'remove', '-',
  { label: 'context.select', enabled: ready, items: ['selectAll', 'selectSounds', 'zoomSelection', 'clearSelection'] },
  { label: 'context.edit', enabled: ready, items: ['trim', 'reverse', 'insertSilence', 'repeatSelection'] },
  volume,
  // ピッチの道具は、ピッチの帯を右クリックしたときだけ
  {
    label: 'context.pitch',
    visible: (c) => c.ed.focusLane === 'pitch',
    enabled: pitchReady,
    items: ['pitchUp', 'pitchDown', 'flatten', 'snap', 'vibrato', 'midi', '-', 'voicingForce', 'voicingMute', 'voicingReset'],
  },
  toNewTrack,
  { ...extract, items: [...extract.items, experimental] },
  '-',
  'exportRange', 'saveToFolder', 'saveManyToFolder',
]
