import type { MenuEntry, MenuGroup } from 'pevenmui'
import { useT } from '../i18n/i18n'

interface Actions {
  hasClip: boolean
  hasSelection: boolean
  hasClipboard: boolean
  /** 選択範囲のみ残すを使えるか（ピッチの帯にフォーカスしているときは使えない） */
  canTrim: boolean
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  showSpectrogram: boolean
  showPitch: boolean
  open: () => void
  save: () => void
  openExport: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  trim: () => void
  clearSelection: () => void
  selectAll: () => void
  playSelection: () => void
  toggleLoop: () => void
  toggleSpectrogram: () => void
  togglePitch: () => void
  /** 波形の帯を出すか（ピッチを出していないときは隠せない） */
  showWave: boolean
  toggleWave: () => void
  showGain: boolean
  toggleGain: () => void
  showFormant: boolean
  toggleFormant: () => void
  /** ピッチを表示していて解析済みか */
  pitchReady: boolean
  /** 選択範囲のピッチを強制表示（1）・強制非表示（-1）・解析のまま（0）にする */
  setVoicing: (value: 1 | -1 | 0) => void
  /** 右クリックした帯がピッチの帯か（ピッチの強制表示などはそのときだけ出す） */
  pitchLane: boolean
  /** ボーカル抽出（追加機能）。対象は選択範囲、なければ全体 */
  extract: (stem: 'vocals' | 'accompaniment') => void
  /** 選んでいるトラックを、ボーカルと伴奏の2トラックに分ける */
  splitStems: () => void
  /** トラックの複製と、ファイルをトラックとして追加 */
  duplicateTrack: () => void
  addTrack: () => void
  /** 音を0から作る（新しいトラック。何も開いていなくても使える） */
  synth: () => void
  /** プロジェクト名を変える */
  showShortcuts: () => void
  showSettings: () => void
  showHistory: () => void
  showAbout: () => void
  /** Ctrl+S をどちらに割り当てているか（メニューの表記用） */
  ctrlS: 'project' | 'export'
}

/** メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身 */
export function useAppMenus(a: Actions): { menus: MenuGroup[]; mobileMenus: MenuGroup[]; context: MenuEntry[] } {
  const t = useT()
  const noClip = !a.hasClip || a.busy
  const noSel = noClip || !a.hasSelection
  // ピッチの強制表示・非表示は、ピッチを表示して解析が済んでから
  const noVoicing = noSel || !a.pitchReady
  const edit: MenuEntry[] = [
    { label: t('edit.cut'), shortcut: 'Ctrl+X', disabled: noSel, onClick: a.cut },
    { label: t('edit.copy'), shortcut: 'Ctrl+C', disabled: noSel, onClick: a.copy },
    { label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: t('edit.trim'), disabled: noSel || !a.canTrim, onClick: a.trim },
    { divider: true },
    { label: t('edit.selectAll'), shortcut: 'Ctrl+A', disabled: noClip, onClick: a.selectAll },
    { label: t('edit.clearSelection'), shortcut: 'Esc', disabled: noSel, onClick: a.clearSelection },
    { divider: true },
    { label: t('extract.vocalsMenu'), disabled: noClip, onClick: () => a.extract('vocals') },
    { label: t('extract.accompanimentMenu'), disabled: noClip, onClick: () => a.extract('accompaniment') },
    { label: t('extract.splitMenu'), disabled: noClip, onClick: a.splitStems },
    { divider: true },
    { label: t('track.duplicate'), disabled: noClip, onClick: a.duplicateTrack },
  ]

  const menus: MenuGroup[] = [
    {
      label: t('menu.file'),
      entries: [
        { label: t('menu.open'), shortcut: 'Ctrl+O', disabled: a.busy, onClick: a.open },
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('synth.menu'), disabled: a.busy, onClick: a.synth },
        { label: t('menu.saveProject'), shortcut: a.ctrlS === 'project' ? 'Ctrl+S' : 'Ctrl+Shift+S', disabled: noClip, onClick: a.save },
        { divider: true },
        { label: t('menu.export'), shortcut: a.ctrlS === 'export' ? 'Ctrl+S' : 'Ctrl+Shift+S', disabled: noClip, onClick: a.openExport },
        { divider: true },
        { label: t('menu.settings'), onClick: a.showSettings },
      ],
    },
    {
      label: t('menu.edit'),
      entries: [
        { label: t('common.undo'), shortcut: 'Ctrl+Z', disabled: !a.canUndo || a.busy, onClick: a.undo },
        { label: t('common.redo'), shortcut: 'Ctrl+Y', disabled: !a.canRedo || a.busy, onClick: a.redo },
        { label: t('history.menu'), disabled: noClip, onClick: a.showHistory },
        { divider: true },
        ...edit,
      ],
    },
    {
      label: t('menu.view'),
      entries: [
        { label: t('menu.spectrogram'), checked: a.showSpectrogram, disabled: !a.hasClip, onClick: a.toggleSpectrogram },
        { label: t('menu.wave'), checked: a.showWave, disabled: !a.hasClip || (a.showWave && !a.showPitch && !a.showSpectrogram && !a.showGain && !a.showFormant), onClick: a.toggleWave },
        { label: t('menu.pitch'), checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
        { label: t('menu.gain'), checked: a.showGain, disabled: !a.hasClip, onClick: a.toggleGain },
        { label: t('menu.formant'), checked: a.showFormant, disabled: !a.hasClip, onClick: a.toggleFormant },
      ],
    },
    {
      label: t('menu.help'),
      entries: [
        { label: t('menu.shortcuts'), onClick: a.showShortcuts },
        { divider: true },
        { label: t('menu.about'), onClick: a.showAbout },
      ],
    },
  ]

  const context: MenuEntry[] = [
    { label: t('play.playSelection'), disabled: noSel, onClick: a.playSelection },
    { label: t('play.loopPreview'), disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    ...edit,
    ...(a.pitchLane
      ? [
          { divider: true as const },
          { label: t('voicing.force'), disabled: noVoicing, onClick: () => a.setVoicing(1) },
          { label: t('voicing.mute'), disabled: noVoicing, onClick: () => a.setVoicing(-1) },
          { label: t('voicing.reset'), disabled: noVoicing, onClick: () => a.setVoicing(0) },
        ]
      : []),
  ]

  // スマホの ⋮ は短くする。切り取りなどは長押しメニュー、元に戻すは上部バー、
  // 表示の切替は波形の下にあるので入れない。キーボードがないのでショートカット一覧も出さない
  const mobileMenus: MenuGroup[] = [
    {
      label: t('menu.file'),
      entries: [
        { label: t('menu.open'), disabled: a.busy, onClick: a.open },
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('synth.menu'), disabled: a.busy, onClick: a.synth },
        { label: t('menu.saveProject'), disabled: noClip, onClick: a.save },
        { label: t('menu.export'), disabled: noClip, onClick: a.openExport },
      ],
    },
    {
      label: t('menu.edit'),
      entries: [
        { label: t('edit.selectAll'), disabled: noClip, onClick: a.selectAll },
        { label: t('edit.clearSelection'), disabled: noSel, onClick: a.clearSelection },
        { label: t('history.menu'), disabled: noClip, onClick: a.showHistory },
      ],
    },
    {
      label: t('menu.help'),
      entries: [
        { label: t('menu.settings'), onClick: a.showSettings },
        { label: t('menu.about'), onClick: a.showAbout },
      ],
    },
  ]

  return { menus, mobileMenus, context }
}
