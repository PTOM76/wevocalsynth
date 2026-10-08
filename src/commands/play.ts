// 再生のコマンド（再生、ループ、移動）
import { defineCommands, opened, selected } from './types'

export const playCommands = defineCommands({
  playPause: { label: (c, t) => t(c.ed.player.playing ? 'play.pause' : 'play.play'), enabled: opened, run: (c) => c.ed.playback.togglePlay() },
  stop: { label: 'common.stop', enabled: opened, run: (c) => c.ed.playback.stop() },
  playSelection: { label: 'play.playSelection', enabled: selected, keyOnlyWhenEnabled: true, run: (c) => c.ed.playback.playSelection() },
  toggleLoop: { label: 'play.repeat', checked: (c) => c.ed.repeat, enabled: opened, keyOnlyWhenEnabled: true, run: (c) => c.ed.setRepeat(!c.ed.repeat) },
  // ←→: 再生位置を戻す、進める（Shift で細かく）
  seekBack: { label: 'key.seekBack', run: (c) => c.ed.seekBy(-1, false) },
  seekForward: { label: 'key.seekForward', run: (c) => c.ed.seekBy(1, false) },
  seekBackFine: { label: 'key.seekBackFine', run: (c) => c.ed.seekBy(-1, true) },
  seekForwardFine: { label: 'key.seekForwardFine', run: (c) => c.ed.seekBy(1, true) },
  seekStart: { label: 'play.toStart', enabled: opened, run: (c) => c.ed.seekEdge('start') },
  seekEnd: { label: 'play.toEnd', enabled: opened, run: (c) => c.ed.seekEdge('end') },
  prevMarker: { label: 'marker.prev', enabled: (c) => c.ed.markers.markers.length > 0, run: (c) => c.ed.seekMarker(-1) },
  nextMarker: { label: 'marker.next', enabled: (c) => c.ed.markers.markers.length > 0, run: (c) => c.ed.seekMarker(1) },
})
