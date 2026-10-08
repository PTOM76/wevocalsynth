import type { MenuEntry } from 'pevenmui'
import { DEFAULT_MIX, type Track, type TrackMix } from '../../audio/tracks'
import { t } from '../../i18n/i18n'

/** トラックの右クリックメニューで使う操作 */
export interface TrackActions {
  tracks: Track[]
  activeId: string
  mix: Record<string, TrackMix>
  busy: boolean
  select: (id: string) => void
  duplicate: (id: string) => void
  addEmpty: () => void
  rename: (id: string) => void
  splitStems: (id: string) => void
  splitLeadStems: (id: string) => void
  /** そのトラックだけを書き出す（書き出しのダイアログを、対象を「選んでいるトラック」にして開く） */
  exportTrack: (id: string) => void
  mergeDown: (id: string) => void
  mergeAll: () => void
  toggleMute: (id: string) => void
  toggleSolo: (id: string) => void
  /** 位相の反転と EQ（トラックの欄の「⋯」から開いたときも、ここで切り替える） */
  inverted: (id: string) => boolean
  toggleInvert: (id: string) => void
  eqOn: (id: string) => boolean
  openEq: (id: string) => void
  /** 大きな波形の後ろに重ねるトラックと、その切り替え */
  overlay: ReadonlySet<string>
  toggleOverlay: (id: string) => void
  remove: (id: string) => void
  /** 複数選んだトラックへのまとめての操作 */
  mergeMany: (ids: string[]) => void
  setMuteMany: (ids: string[], on: boolean) => void
  setSoloMany: (ids: string[], on: boolean) => void
  removeMany: (ids: string[]) => void
}

/**
 * トラック `id` の右クリックメニュー（一覧・タブのどちらの表示でも同じ）。
 */
export function trackMenuEntries(id: string, a: TrackActions): MenuEntry[] {
  const i = a.tracks.findIndex((tr) => tr.id === id)
  const m = a.mix[id] ?? DEFAULT_MIX
  return [
    { label: t('track.rename'), disabled: a.busy, onClick: () => a.rename(id) },
    { label: t('track.duplicate'), disabled: a.busy, onClick: () => a.duplicate(id) },
    { label: t('track.addEmpty'), disabled: a.busy, onClick: a.addEmpty },
    { label: t('extract.splitMenu'), disabled: a.busy, onClick: () => a.splitStems(id) },
    { label: t('extract.splitLeadMenu'), disabled: a.busy, onClick: () => a.splitLeadStems(id) },
    { label: t('track.export'), disabled: a.busy, onClick: () => a.exportTrack(id) },
    { divider: true },
    { label: t('track.mergeDown'), disabled: a.busy || i + 1 >= a.tracks.length, onClick: () => a.mergeDown(id) },
    { label: t('track.mergeAll'), disabled: a.busy || a.tracks.length < 2, onClick: a.mergeAll },
    { divider: true },
    { label: t('track.mute'), checked: m.mute, onClick: () => a.toggleMute(id) },
    { label: t('track.solo'), checked: m.solo, onClick: () => a.toggleSolo(id) },
    { label: t('track.invert'), checked: a.inverted(id), onClick: () => a.toggleInvert(id) },
    { label: t('eq.menu'), checked: a.eqOn(id), disabled: a.busy, onClick: () => a.openEq(id) },
    // 選んでいるトラックは大きな波形そのものなので、重ねられない
    { label: t('track.overlay'), checked: a.overlay.has(id), disabled: id === a.activeId, onClick: () => a.toggleOverlay(id) },
    { divider: true },
    { label: t('track.remove'), disabled: a.busy || a.tracks.length < 2, onClick: () => a.remove(id) },
  ]
}

/**
 * 複数選んだトラック `ids` の右クリックメニュー。ミュート・ソロは、全部オンなら外し、そうでなければ全部オンにする
 */
export function multiTrackMenuEntries(ids: string[], a: TrackActions): MenuEntry[] {
  const allMute = ids.every((id) => (a.mix[id] ?? DEFAULT_MIX).mute)
  const allSolo = ids.every((id) => (a.mix[id] ?? DEFAULT_MIX).solo)
  return [
    { label: t('track.mergeSelected'), disabled: a.busy, onClick: () => a.mergeMany(ids) },
    { divider: true },
    { label: t('track.mute'), checked: allMute, onClick: () => a.setMuteMany(ids, !allMute) },
    { label: t('track.solo'), checked: allSolo, onClick: () => a.setSoloMany(ids, !allSolo) },
    { divider: true },
    // 全部は消せない（1本は残す）
    { label: t('track.removeSelected', { count: ids.length }), disabled: a.busy || ids.length >= a.tracks.length, onClick: () => a.removeMany(ids) },
  ]
}
