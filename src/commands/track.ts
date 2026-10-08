// トラックのコマンド（選んでいるトラックに効く）
import { isFlatEq } from '../effects/eq/eq'
import { defineCommands, ready, type CommandContext } from './types'

const active = (c: CommandContext) => c.ed.tracks.settingsOf(c.ed.tracks.activeId)
const activeIndex = (c: CommandContext) => c.ed.tracks.tracks.findIndex((tr) => tr.id === c.ed.tracks.activeId)
// ミュート、ソロ、位相反転、削除は 2 本以上のときだけ（1 本では意味がなく、自動で解除する）
const several = (c: CommandContext) => ready(c) && c.ed.tracks.tracks.length >= 2

export const trackCommands = defineCommands({
  duplicateTrack: { label: 'track.duplicate', enabled: ready, run: (c) => c.ed.tracks.duplicate() },
  trackFromOriginal: {
    label: 'track.fromOriginalMenu',
    enabled: (c) => ready(c) && c.ed.tracks.tracks.some((tr) => tr.id === c.ed.tracks.activeId && tr.original !== tr.clip),
    run: (c) => c.ed.tracks.fromOriginal(),
  },
  addEmptyTrack: { label: 'track.addEmpty', enabled: ready, run: (c) => c.ed.tracks.addEmpty() },
  renameTrack: { label: 'track.rename', enabled: ready, run: (c) => c.trackArea.openRename(c.ed.tracks.activeId) },
  removeTrack: { label: 'track.remove', enabled: several, run: (c) => c.ed.tracks.remove(c.ed.tracks.activeId) },
  mute: { label: 'track.mute', checked: (c) => active(c).mix.mute, enabled: several, run: (c) => c.ed.tracks.toggleMute(c.ed.tracks.activeId) },
  solo: { label: 'track.solo', checked: (c) => active(c).mix.solo, enabled: several, run: (c) => c.ed.tracks.toggleSolo(c.ed.tracks.activeId) },
  invert: { label: 'track.invert', checked: (c) => !!active(c).fader.invert, enabled: several, run: (c) => c.ed.tracks.toggleInvert(c.ed.tracks.activeId) },
  eq: { label: 'eq.menu', checked: (c) => !isFlatEq(active(c).eq), enabled: ready, run: (c) => c.dialogs.open('eq') },
  mergeDown: {
    label: 'track.mergeDown',
    enabled: (c) => ready(c) && activeIndex(c) >= 0 && activeIndex(c) < c.ed.tracks.tracks.length - 1,
    run: (c) => void c.ed.tracks.mergeDown(c.ed.tracks.activeId),
  },
  mergeAll: { label: 'track.mergeAll', enabled: several, run: (c) => void c.ed.tracks.mergeAll() },
})
