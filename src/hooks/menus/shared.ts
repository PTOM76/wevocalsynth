// メニューバーと右クリックで共通の項目
import type { MenuEntry } from 'pevenmui'
import type { MessageKey } from '../../i18n/i18n'
import type { ActionId } from '../../settings/keymap'
import type { Settings } from '../../settings/settings'
import type { BoolKey } from '../../settings/items/toggle'
import type { MenuActions } from './actions'
import type { Commands } from '../../commands'

/** メニューを作る関数に渡すもの */
export interface MenuCtx {
  a: MenuActions
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  /** 操作に割り当てたキーの表記 */
  key: (id: ActionId) => string | undefined
  s: Settings
  /** コマンドからメニューの項目を作る（src/commands/） */
  item: Commands['item']
  toggle: (key: BoolKey, rest?: { checked?: boolean; disabled?: boolean; shortcut?: string }) => MenuEntry
  noClip: boolean
  noSel: boolean
  /** ピッチの強制表示と非表示は、ピッチを表示して解析が済んでから */
  noVoicing: boolean
  noPitch: boolean
}

/** 選択範囲を新しいトラックへ（コピー、移動） */
export const toNewTrack = ({ a, t, noSel }: MenuCtx): MenuEntry => ({
  label: t('menu.toNewTrack'),
  disabled: noSel,
  submenu: [
    { label: t('track.copySelection'), onClick: () => a.selectionToTrack(false) },
    { label: t('track.moveSelection'), onClick: () => a.selectionToTrack(true) },
  ],
})

/** 編集メニューの中ほど（切り取りから選択の解除まで） */
export function editEntries(c: MenuCtx): MenuEntry[] {
  const { item } = c
  return [
    item('cut'),
    item('copy'),
    item('paste'),
    item('remove'),
    item('trim'),
    item('reverse'),
    item('insertSilence'),
    item('repeatSelection'),
    toNewTrack(c),
    { divider: true },
    item('selectAll'),
    item('selectSounds'),
    item('clearSelection'),
  ]
}

/** ボーカル抽出（選択範囲、なければ全体）。メニューバーでは「ツール」、右クリックメニューでは編集の後ろに出す */
export function extractEntries({ a, t, noClip }: MenuCtx): MenuEntry[] {
  return [
    { label: t('extract.vocalsMenu'), disabled: noClip, onClick: () => a.extract('vocals') },
    { label: t('extract.accompanimentMenu'), disabled: noClip, onClick: () => a.extract('accompaniment') },
    { label: t('extract.splitMenu'), disabled: noClip, onClick: a.splitStems },
    { label: t('extract.splitLeadMenu'), disabled: noClip, onClick: a.splitLeadStems },
    { label: t('extract.splitInstrumentsMenu'), disabled: noClip, onClick: a.splitInstrumentStems },
    ...(a.splitVoices
      ? [
          { divider: true } as const,
          { label: t('voices.byPitchMenu'), disabled: noClip, onClick: () => a.splitVoices?.('pitch') },
          { label: t('voices.byVolumeMenu'), disabled: noClip, onClick: () => a.splitVoices?.('volume') },
        ]
      : []),
    ...(a.kanaDemo
      ? [
          { divider: true } as const,
          {
            label: t('kana.demoMenu'),
            disabled: noClip,
            submenu: (['a', 'i', 'u', 'e', 'o'] as const).map((v, i) => ({ label: t(`kana.from.${v}`), onClick: () => a.kanaDemo?.(i) })),
          },
        ]
      : []),
  ]
}

/** 編集メニューに入れすぎないよう、加工の道具（抽出・音声の作成）は「ツール」にまとめる */
export function toolsEntries(c: MenuCtx): MenuEntry[] {
  const { a, t, noClip } = c
  return [
    ...extractEntries(c),
    { divider: true },
    { label: t('sampler.menu'), disabled: noClip, onClick: a.sampler },
    { label: t('synth.menu'), disabled: a.busy, onClick: a.synth },
    { label: t('record.menu'), disabled: a.busy || !a.record, onClick: () => a.record?.() },
  ]
}

/** 音量の編集（選択範囲、なければ全体）。メニューバーの「編集」と右クリックで同じもの */
export function volumeMenu({ a, t, noClip }: MenuCtx): MenuEntry {
  return {
    label: t('volume.title'),
    disabled: noClip,
    submenu: [
      { label: t('volume.fadeIn'), onClick: () => a.volumeAction('fadeIn') },
      { label: t('volume.fadeOut'), onClick: () => a.volumeAction('fadeOut') },
      { label: t('volume.normalize'), onClick: () => a.volumeAction('normalize') },
      { label: t('volume.silence'), onClick: () => a.volumeAction('silence') },
    ],
  }
}

/** 最近使用したファイル（File System Access API が使えるブラウザでだけ出す） */
export function recentEntries({ a, t }: MenuCtx): MenuEntry[] {
  return !a.recent.supported
    ? []
    : [
        {
          label: t('menu.recent'),
          disabled: a.busy,
          submenu: a.recent.names.length
            ? [
                ...a.recent.names.map((name, i): MenuEntry => ({ label: name, onClick: () => a.recent.open(i) })),
                { divider: true },
                { label: t('menu.recentClear'), onClick: a.recent.clear },
              ]
            : [{ label: t('menu.recentEmpty'), disabled: true, onClick: () => {} }],
        },
      ]
}
