// 編集のコマンド（元に戻す、切り取りなど、選択、マーカー、音量）
import { defineCommands, opened, ready, selected, type CommandContext } from './types'

/** 複数の選択範囲を、再生位置から前後へ順に選ぶ（選んだものを最後にして加工の対象にし、その頭へ移る） */
function stepSelection(c: CommandContext, dir: -1 | 1) {
  const { selections, player } = c.ed
  const sorted = [...selections].sort((a, b) => a.start - b.start)
  const pos = player.livePosition()
  const next = dir > 0 ? (sorted.find((r) => r.start > pos + 1e-3) ?? sorted[0]) : ([...sorted].reverse().find((r) => r.start < pos - 1e-3) ?? sorted[sorted.length - 1])
  if (!next) return
  c.ed.setSelections([...selections.filter((r) => r !== next), next])
  player.seek(next.start)
}
const several = (c: CommandContext) => c.ed.selections.length > 1

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
  // キーで選択範囲を新しいトラックへコピーする（メニューでは copySelectionToTrack）
  toNewTrack: { label: 'key.toNewTrack', enabled: selected, keyOnlyWhenEnabled: true, run: (c) => c.ed.tracks.fromSelection(c.ed.selections, false) },
  copySelectionToTrack: { label: 'track.copySelection', enabled: selected, run: (c) => c.ed.tracks.fromSelection(c.ed.selections, false) },
  moveSelectionToTrack: { label: 'track.moveSelection', enabled: selected, run: (c) => c.ed.tracks.fromSelection(c.ed.selections, true) },
  selectAll: { label: 'edit.selectAll', enabled: ready, run: (c) => c.ed.selectAll() },
  selectSounds: { label: 'soundSelect.menu', enabled: ready, keyOnlyWhenEnabled: true, run: (c) => c.dialogs.open('soundSelect') },
  nextSelection: { label: 'key.nextSelection', enabled: several, keyOnlyWhenEnabled: true, run: (c) => stepSelection(c, 1) },
  prevSelection: { label: 'key.prevSelection', enabled: several, keyOnlyWhenEnabled: true, run: (c) => stepSelection(c, -1) },
  clearSelection: { label: 'edit.clearSelection', enabled: selected, run: (c) => c.ed.clearSelection() },

  // 加工の欄の「適用」
  apply: { label: 'key.apply', enabled: ready, keyOnlyWhenEnabled: true, run: (c) => void c.ed.apply() },

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
