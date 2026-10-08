import type { MenuEntry } from 'pevenmui'
import { extractEntries, toNewTrack, volumeMenu, type MenuCtx } from './shared'

/** 波形の右クリック。上の段は 10 個前後にし、まとまりはサブメニューにする（docs/DECISIONS.md の「メニューの構成」） */
export function contextMenu(c: MenuCtx): MenuEntry[] {
  const { a, t, key, noClip, noSel, noPitch, noVoicing } = c
  return [
    { label: t('play.playSelection'), shortcut: key('playSelection'), disabled: noSel, onClick: a.playSelection },
    { label: t('play.repeat'), shortcut: key('toggleLoop'), disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    { label: t('edit.cut'), shortcut: key('cut'), disabled: noSel, onClick: a.cut },
    { label: t('edit.copy'), shortcut: key('copy'), disabled: noSel, onClick: a.copy },
    { label: t('edit.paste'), shortcut: key('paste'), disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: t('edit.delete'), shortcut: key('remove'), disabled: noSel, onClick: a.remove },
    { divider: true },
    {
      label: t('context.select'),
      disabled: noClip,
      submenu: [
        { label: t('edit.selectAll'), shortcut: key('selectAll'), onClick: a.selectAll },
        { label: t('soundSelect.menu'), shortcut: key('selectSounds'), onClick: a.selectSounds },
        { label: t('wave.zoomSelection'), disabled: !a.hasSelection, onClick: a.zoomSelection },
        { label: t('edit.clearSelection'), shortcut: key('clearSelection'), disabled: !a.hasSelection, onClick: a.clearSelection },
      ],
    },
    {
      label: t('context.edit'),
      disabled: noClip,
      submenu: [
        { label: t('edit.trim'), shortcut: key('trim'), disabled: !a.hasSelection || !a.canTrim, onClick: a.trim },
        { label: t('edit.reverse'), onClick: a.reverse },
        { label: t('silence.menu'), onClick: a.insertSilence },
        { label: t('repeat.menu'), disabled: !a.hasSelection, onClick: a.repeatSelection },
      ],
    },
    volumeMenu(c),
    // ピッチの道具は、ピッチの帯を右クリックしたときだけ
    ...(a.pitchLane
      ? [
          {
            label: t('context.pitch'),
            disabled: noPitch,
            submenu: [
              { label: t('context.pitchUp'), shortcut: key('pitchUp'), onClick: () => a.pitchTool.shift(1) },
              { label: t('context.pitchDown'), shortcut: key('pitchDown'), onClick: () => a.pitchTool.shift(-1) },
              { label: t('context.flatten'), onClick: a.pitchTool.flatten },
              // ダイアログを開くものは「…」を付ける
              { label: `${t('snap.title')}…`, onClick: a.pitchTool.snap },
              { label: `${t('vibrato.title')}…`, onClick: a.pitchTool.vibrato },
              { label: `${t('midi.title')}…`, onClick: a.pitchTool.midi },
              { divider: true as const },
              { label: t('voicing.force'), disabled: noVoicing, onClick: () => a.setVoicing(1) },
              { label: t('voicing.mute'), disabled: noVoicing, onClick: () => a.setVoicing(-1) },
              { label: t('voicing.reset'), disabled: noVoicing, onClick: () => a.setVoicing(0) },
            ],
          },
        ]
      : []),
    toNewTrack(c),
    { label: t('context.extract'), disabled: noClip, submenu: extractEntries(c) },
    { divider: true },
    // 選択範囲があれば、書き出しの範囲は選択範囲で開く（ExportDialog）
    { label: t(a.hasSelection ? 'context.exportSelection' : 'menu.export'), disabled: noClip, onClick: a.openExport },
    ...(a.saveToFolder ? [{ label: t('folder.save'), shortcut: key('saveToFolder'), disabled: noSel, onClick: a.saveToFolder }] : []),
    ...(a.saveManyToFolder ? [{ label: t('folder.saveMany', { n: a.selectionCount }), onClick: a.saveManyToFolder }] : []),
  ]
}
