// 編集のコマンド（元に戻す、切り取りなど、選択、マーカー、音量）
import { defineCommands, opened, ready, selected, type CommandContext } from './types'

/** 再生位置にあるマーカー */
const currentMarker = (c: CommandContext) => c.ed.markers.current(c.ed.player.livePosition())

export const editCommands = defineCommands({
  undo: { label: 'common.undo', enabled: (c) => c.ed.history.canUndo && !c.ed.busy, run: (c) => c.ed.history.undo() },
  redo: { label: 'common.redo', enabled: (c) => c.ed.history.canRedo && !c.ed.busy, run: (c) => c.ed.history.redo() },
  history: { label: 'history.menu', enabled: ready, run: (c) => c.dialogs.open('history') },
  // 切り取りなどは、フォーカスしている帯（波形なら音声、ピッチなら曲線）に効く（ed.clip が振り分ける）
  cut: { label: 'edit.cut', enabled: selected, run: (c) => c.ed.clip.cut() },
  copy: { label: 'edit.copy', enabled: selected, run: (c) => c.ed.clip.copy() },
  paste: { label: 'edit.paste', enabled: (c) => ready(c) && c.ed.clip.hasClipboard, run: (c) => c.ed.clip.paste() },
  remove: { label: 'edit.delete', enabled: selected, run: (c) => c.ed.clip.remove() },
  trim: { label: 'edit.trim', enabled: (c) => selected(c) && c.ed.clip.canTrim, run: (c) => c.ed.clip.trim() },
  reverse: { label: 'edit.reverse', enabled: ready, run: (c) => c.ed.cmd.reverse() },
  insertSilence: { label: 'silence.menu', enabled: ready, run: (c) => c.dialogs.open('silence') },
  repeatSelection: { label: 'repeat.menu', enabled: selected, run: (c) => c.dialogs.open('repeat') },
  copySelectionToTrack: { label: 'track.copySelection', enabled: selected, run: (c) => c.ed.tracks.fromSelection(c.ed.selections, false) },
  moveSelectionToTrack: { label: 'track.moveSelection', enabled: selected, run: (c) => c.ed.tracks.fromSelection(c.ed.selections, true) },
  selectAll: { label: 'edit.selectAll', enabled: ready, run: (c) => c.ed.selectAll() },
  selectSounds: { label: 'soundSelect.menu', enabled: ready, run: (c) => c.dialogs.open('soundSelect') },
  clearSelection: { label: 'edit.clearSelection', enabled: selected, run: (c) => c.ed.clearSelection() },

  // マーカー
  addMarker: { label: 'marker.add', run: (c) => c.ed.addMarker() },
  renameMarker: { label: 'marker.rename', enabled: (c) => !!currentMarker(c), run: (c) => c.dialogs.open('renameMarker', currentMarker(c)?.id) },
  markerTempo: { label: 'marker.tempo', enabled: (c) => !!currentMarker(c), run: (c) => c.dialogs.open('markerTempo', currentMarker(c)?.id) },
  removeMarker: {
    label: 'marker.remove',
    enabled: (c) => !!currentMarker(c),
    run: (c) => {
      const m = currentMarker(c)
      if (m) c.ed.markers.remove(m.id)
    },
  },
  clearMarkers: { label: 'marker.clear', enabled: (c) => c.ed.markers.markers.length > 0, run: (c) => c.ed.markers.clear() },

  // 音量の編集（選択範囲、なければ全体）
  fadeIn: { label: 'volume.fadeIn', enabled: opened, run: (c) => c.ed.cmd.volume('fadeIn') },
  fadeOut: { label: 'volume.fadeOut', enabled: opened, run: (c) => c.ed.cmd.volume('fadeOut') },
  normalize: { label: 'volume.normalize', enabled: opened, run: (c) => c.ed.cmd.volume('normalize') },
  silence: { label: 'volume.silence', enabled: opened, run: (c) => c.ed.cmd.volume('silence') },
})
