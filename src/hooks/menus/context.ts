// 波形の右クリックメニュー
import type { MenuEntry } from 'pevenmui'
import { extractEntries, toNewTrack, volumeMenu, type MenuCtx } from './shared'

/** 波形の右クリック。上の段は 10 個前後にし、まとまりはサブメニューにする（docs/DECISIONS.md の「メニューの構成」） */
export function contextMenu(c: MenuCtx): MenuEntry[] {
  const { a, t, key, item, noClip, noSel, noPitch, noVoicing } = c
  return [
    { label: t('play.playSelection'), shortcut: key('playSelection'), disabled: noSel, onClick: a.playSelection },
    { label: t('play.repeat'), shortcut: key('toggleLoop'), disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    item('cut'),
    item('copy'),
    item('paste'),
    item('remove'),
    { divider: true },
    {
      label: t('context.select'),
      disabled: noClip,
      submenu: [
        item('selectAll'),
        item('selectSounds'),
        { label: t('wave.zoomSelection'), disabled: !a.hasSelection, onClick: a.zoomSelection },
        item('clearSelection'),
      ],
    },
    {
      label: t('context.edit'),
      disabled: noClip,
      submenu: [
        item('trim'),
        item('reverse'),
        item('insertSilence'),
        item('repeatSelection'),
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
