// 再生のコマンド（再生、ループ、移動）
import { defineCommands, opened, selected } from './types'

export const playCommands = defineCommands({
  playPause: { label: (c, t) => t(c.ed.player.playing ? 'play.pause' : 'play.play'), enabled: opened, run: (c) => c.ed.playback.togglePlay() },
  stop: { label: 'common.stop', enabled: opened, run: (c) => c.ed.playback.stop() },
  playSelection: { label: 'play.playSelection', enabled: selected, run: (c) => c.ed.playback.playSelection() },
  toggleLoop: { label: 'play.repeat', checked: (c) => c.ed.repeat, enabled: opened, run: (c) => c.ed.setRepeat(!c.ed.repeat) },
  seekStart: { label: 'play.toStart', enabled: opened, run: (c) => c.ed.seekEdge('start') },
  seekEnd: { label: 'play.toEnd', enabled: opened, run: (c) => c.ed.seekEdge('end') },
  prevMarker: { label: 'marker.prev', enabled: (c) => c.ed.markers.markers.length > 0, run: (c) => c.ed.seekMarker(-1) },
  nextMarker: { label: 'marker.next', enabled: (c) => c.ed.markers.markers.length > 0, run: (c) => c.ed.seekMarker(1) },
})
