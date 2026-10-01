import type { MenuEntry } from '../menu/MenuList'
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
  rename: (id: string) => void
  splitStems: (id: string) => void
  mergeDown: (id: string) => void
  mergeAll: () => void
  toggleMute: (id: string) => void
  toggleSolo: (id: string) => void
  /** 大きな波形の後ろに重ねるトラックと、その切り替え */
  overlay: ReadonlySet<string>
  toggleOverlay: (id: string) => void
  remove: (id: string) => void
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
    { label: t('extract.splitMenu'), disabled: a.busy, onClick: () => a.splitStems(id) },
    { divider: true },
    { label: t('track.mergeDown'), disabled: a.busy || i + 1 >= a.tracks.length, onClick: () => a.mergeDown(id) },
    { label: t('track.mergeAll'), disabled: a.busy || a.tracks.length < 2, onClick: a.mergeAll },
    { divider: true },
    { label: t('track.mute'), checked: m.mute, onClick: () => a.toggleMute(id) },
    { label: t('track.solo'), checked: m.solo, onClick: () => a.toggleSolo(id) },
    // 選んでいるトラックは大きな波形そのものなので、重ねられない
    { label: t('track.overlay'), checked: a.overlay.has(id), disabled: id === a.activeId, onClick: () => a.toggleOverlay(id) },
    { divider: true },
    { label: t('track.remove'), disabled: a.busy || a.tracks.length < 2, onClick: () => a.remove(id) },
  ]
}
