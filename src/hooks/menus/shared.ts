import type { MenuEntry } from 'pevenmui'
import type { MessageKey } from '../../i18n/i18n'
import type { ActionId } from '../../settings/keymap'
import type { Settings } from '../../settings/settings'
import type { BoolKey } from '../../settings/items/toggle'
import type { MenuActions } from './actions'

/** メニューを作る関数に渡すもの */
export interface MenuCtx {
  a: MenuActions
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  /** 操作に割り当てたキーの表記 */
  key: (id: ActionId) => string | undefined
  s: Settings
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
  const { a, t, key, noClip, noSel } = c
  return [
    { label: t('edit.cut'), shortcut: key('cut'), disabled: noSel, onClick: a.cut },
    { label: t('edit.copy'), shortcut: key('copy'), disabled: noSel, onClick: a.copy },
    { label: t('edit.paste'), shortcut: key('paste'), disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: t('edit.delete'), shortcut: key('remove'), disabled: noSel, onClick: a.remove },
    { label: t('edit.trim'), shortcut: key('trim'), disabled: noSel || !a.canTrim, onClick: a.trim },
    { label: t('edit.reverse'), disabled: noClip, onClick: a.reverse },
    { label: t('silence.menu'), disabled: noClip, onClick: a.insertSilence },
    { label: t('repeat.menu'), disabled: noSel, onClick: a.repeatSelection },
    toNewTrack(c),
    { divider: true },
    { label: t('edit.selectAll'), shortcut: key('selectAll'), disabled: noClip, onClick: a.selectAll },
    { label: t('soundSelect.menu'), shortcut: key('selectSounds'), disabled: noClip, onClick: a.selectSounds },
    { label: t('edit.clearSelection'), shortcut: key('clearSelection'), disabled: noSel, onClick: a.clearSelection },
  ]
}

/** ボーカル抽出（選択範囲、なければ全体）。メニューバーでは「ツール」、右クリックメニューでは編集の後ろに出す */
export function extractEntries({ a, t, noClip }: MenuCtx): MenuEntry[] {
  return [
    { label: t('extract.vocalsMenu'), disabled: noClip, onClick: () => a.extract('vocals') },
    { label: t('extract.accompanimentMenu'), disabled: noClip, onClick: () => a.extract('accompaniment') },
    { label: t('extract.splitMenu'), disabled: noClip, onClick: a.splitStems },
    { label: t('extract.splitLeadMenu'), disabled: noClip, onClick: a.splitLeadStems },
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
