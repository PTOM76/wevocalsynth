// メニューバー（スマホでは ⋮ のメニュー一覧）
import type { MenuGroup } from 'pevenmui'
import { openExternal, USER_GUIDE_URL } from '../../links'
import { editEntries, recentEntries, toolsEntries, volumeMenu, type MenuCtx } from './shared'

/** メニューバー（スマホでは ⋮ のメニュー一覧） */
export function menuBar(c: MenuCtx): MenuGroup[] {
  const { a, t, key, s, item, toggle, noClip, noSel } = c
  return [
    {
      label: t('menu.file'),
      accessKey: 'F',
      entries: [
        { label: t('menu.open'), shortcut: key('open'), disabled: a.busy, onClick: a.open },
        ...recentEntries(c),
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('menu.saveProject'), shortcut: key('saveProject'), disabled: noClip, onClick: a.save },
        { label: t('menu.saveProjectAs'), disabled: noClip, onClick: a.saveAs },
        { divider: true },
        { label: t('menu.export'), shortcut: key('exportAudio'), disabled: noClip, onClick: a.openExport },
        ...(a.videoAvailable ? [{ label: t('menu.exportVideo'), disabled: noClip, onClick: a.openVideoExport }] : []),
        { divider: true },
        { label: t('menu.settings'), onClick: a.showSettings },
      ],
    },
    {
      label: t('menu.edit'),
      accessKey: 'E',
      entries: [
        item('undo'),
        item('redo'),
        item('history'),
        { divider: true },
        ...editEntries(c),
        { divider: true },
        {
          label: t('menu.marker'),
          disabled: !a.hasClip,
          submenu: [
            { label: t('marker.add'), shortcut: key('addMarker'), onClick: a.addMarker },
            { label: t('marker.rename'), disabled: !a.hasCurrentMarker, onClick: a.renameMarker },
            { label: t('marker.tempo'), disabled: !a.hasCurrentMarker, onClick: a.markerTempo },
            { label: t('marker.remove'), disabled: !a.hasCurrentMarker, onClick: a.removeMarker },
            { label: t('marker.clear'), disabled: !a.hasMarkers, onClick: a.clearMarkers },
          ],
        },
        // 音量の編集（今は音量の欄にもある）
        volumeMenu(c),
      ],
    },
    {
      label: t('menu.view'),
      accessKey: 'V',
      entries: [
        { label: t('menu.spectrogram'), checked: a.showSpectrogram, disabled: !a.hasClip, onClick: a.toggleSpectrogram },
        { label: t('menu.wave'), checked: a.showWave, disabled: !a.hasClip || (a.showWave && !a.showPitch && !a.showSpectrogram && !a.showGain && !a.showFormant), onClick: a.toggleWave },
        { label: t('menu.pitch'), checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
        { label: t('menu.gain'), checked: a.showGain, disabled: !a.hasClip, onClick: a.toggleGain },
        { label: t('menu.formant'), checked: a.showFormant, disabled: !a.hasClip, onClick: a.toggleFormant },
        { divider: true },
        // ピッチの線と音符は、どちらか一方は残す
        toggle('showPitchLine', { checked: s.showPitchLine || !s.showNotes, disabled: !a.hasClip || !a.showPitch || !s.showNotes }),
        toggle('showNotes', { disabled: !a.hasClip || !a.showPitch || (s.showNotes && !s.showPitchLine) }),
        toggle('overlayPitch', { disabled: !a.hasClip || !a.showPitch }),
        toggle('minimap', { disabled: !a.hasClip }),
        { divider: true },
        { label: t('wave.zoomIn'), shortcut: s.wheelZoom === 'wheel' ? 'Wheel' : 'Ctrl+Wheel', disabled: !a.hasClip || !a.canZoomIn, onClick: a.zoomIn },
        { label: t('wave.zoomOut'), disabled: !a.hasClip || !a.zoomed, onClick: a.zoomOut },
        { label: t('wave.showAll'), disabled: !a.hasClip || !a.zoomed, onClick: a.showAll },
        { label: t('wave.zoomSelection'), disabled: noSel, onClick: a.zoomSelection },
        {
          label: t('wave.vZoom'),
          disabled: !a.hasClip,
          submenu: [
            { label: t('wave.vZoomIn'), shortcut: 'Alt+Wheel', disabled: a.waveScale >= 64, onClick: () => a.stepWaveScale(1) },
            { label: t('wave.vZoomOut'), disabled: a.waveScale <= 1, onClick: () => a.stepWaveScale(-1) },
            { label: t('wave.vZoomReset'), disabled: a.waveScale === 1, onClick: a.resetWaveScale },
          ],
        },
        toggle('followPlayhead'),
      ],
    },
    {
      label: t('menu.play'),
      accessKey: 'P',
      entries: [
        { label: t(a.playing ? 'play.pause' : 'play.play'), shortcut: key('playPause'), disabled: !a.hasClip, onClick: a.togglePlay },
        { label: t('common.stop'), disabled: !a.hasClip, onClick: a.stop },
        { label: t('play.playSelection'), shortcut: key('playSelection'), disabled: noSel, onClick: a.playSelection },
        { label: t('play.repeat'), shortcut: key('toggleLoop'), checked: a.repeat, disabled: !a.hasClip, onClick: a.toggleLoop },
        { divider: true },
        { label: t('play.toStart'), shortcut: key('seekStart'), disabled: !a.hasClip, onClick: () => a.seekEdge('start') },
        { label: t('play.toEnd'), shortcut: key('seekEnd'), disabled: !a.hasClip, onClick: () => a.seekEdge('end') },
        { label: t('marker.prev'), shortcut: key('prevMarker'), disabled: !a.hasMarkers, onClick: () => a.seekMarker(-1) },
        { label: t('marker.next'), shortcut: key('nextMarker'), disabled: !a.hasMarkers, onClick: () => a.seekMarker(1) },
      ],
    },
    {
      label: t('menu.track'),
      accessKey: 'R',
      entries: [
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('track.duplicate'), disabled: noClip, onClick: a.duplicateTrack },
        { label: t('track.fromOriginalMenu'), disabled: noClip || !a.hasOriginal, onClick: a.trackFromOriginal },
        { label: t('track.addEmpty'), disabled: noClip, onClick: a.addEmptyTrack },
        { label: t('track.copySelection'), disabled: noSel, onClick: () => a.selectionToTrack(false) },
        { label: t('track.moveSelection'), disabled: noSel, onClick: () => a.selectionToTrack(true) },
        { label: t('track.rename'), disabled: noClip, onClick: a.renameTrack },
        { label: t('track.remove'), disabled: noClip || a.trackCount < 2, onClick: a.removeTrack },
        { divider: true },
        // ミュート・ソロ・位相反転は2本以上のときだけ（1本では意味がなく、自動で解除する）
        { label: t('track.mute'), checked: a.activeMute, disabled: noClip || a.trackCount < 2, onClick: a.toggleMute },
        { label: t('track.solo'), checked: a.activeSolo, disabled: noClip || a.trackCount < 2, onClick: a.toggleSolo },
        { label: t('track.invert'), checked: a.activeInvert, disabled: noClip || a.trackCount < 2, onClick: a.toggleInvert },
        { label: t('eq.menu'), checked: a.activeEq, disabled: noClip, onClick: a.openEq },
        { divider: true },
        { label: t('track.mergeDown'), disabled: noClip || !a.canMergeDown, onClick: a.mergeDown },
        { label: t('track.mergeAll'), disabled: noClip || a.trackCount < 2, onClick: a.mergeAll },
      ],
    },
    { label: t('menu.tools'), accessKey: 'T', entries: toolsEntries(c) },
    {
      label: t('menu.help'),
      accessKey: 'H',
      entries: [
        { label: t('menu.userGuide'), onClick: () => openExternal(USER_GUIDE_URL) },
        { label: t('menu.shortcuts'), onClick: a.showShortcuts },
        { divider: true },
        { label: t('menu.checkUpdate'), onClick: a.checkUpdate },
        { label: t('menu.licenses'), onClick: a.showLicenses },
        { label: t('menu.about'), onClick: a.showAbout },
      ],
    },
  ]
}
