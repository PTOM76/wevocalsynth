// キーボードショートカットと、フォーカスしている帯に効く切り取りなど
import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { useShortcuts } from 'pevenmui'
import type { Clip, Range } from '../audio/types'
import type { usePlayer } from '../audio/usePlayer'
import type { EditParams } from '../components/EditPanel'
import { resolveKeymap } from '../settings/keymap'
import type { Settings } from '../settings/settings'
import type { useClipCommands } from './useClipCommands'
import type { Toast } from './useEditor'
import type { useHistory } from './useHistory'
import type { useLanes } from './useLanes'
import type { usePlayback } from './usePlayback'
import { usePitchClipboard } from './usePitchClipboard'
import type { usePitchTarget } from './usePitchTarget'
import type { usePitchTools } from './usePitchTools'
import type { useSeek } from './useSeek'

interface Options {
  settings: Settings
  edited: Clip | null
  editing: boolean
  busy: boolean
  pitch: Float32Array | null
  pitchTarget: ReturnType<typeof usePitchTarget>
  pitchTools: ReturnType<typeof usePitchTools>
  showPitch: boolean
  focusLane: ReturnType<typeof useLanes>['focusLane']
  cmd: ReturnType<typeof useClipCommands>
  selections: Range[]
  setSelections: (rs: Range[]) => void
  setParams: Dispatch<SetStateAction<EditParams>>
  player: ReturnType<typeof usePlayer>
  playback: ReturnType<typeof usePlayback>
  history: ReturnType<typeof useHistory>
  picker: { open: () => void }
  saveProjectFile: () => unknown
  openExport: () => void
  selectAll: () => unknown
  clearSelection: () => void
  addMarker: () => unknown
  seekMarker: (dir: -1 | 1) => void
  seekBy: ReturnType<typeof useSeek>['seekBy']
  seekEdge: ReturnType<typeof useSeek>['seekEdge']
  setToast: (toast: Toast | null) => void
}

/** キーボードショートカットと、フォーカスしている帯（波形かピッチ）に効く切り取り、コピー、貼り付け */
export function useEditorKeys(o: Options) {
  const { settings, edited, editing, busy, pitch, pitchTarget, pitchTools, showPitch, focusLane, cmd, selections, setSelections, setParams, player, playback, history, picker, saveProjectFile, openExport, selectAll, clearSelection, addMarker, seekMarker, seekBy, seekEdge, setToast } = o
  /** 複数の選択範囲を、再生位置から前後へ順に選ぶ（選んだものを最後にして加工の対象にし、その頭へ移る） */
  const stepSelection = (dir: -1 | 1) => {
    const sorted = [...selections].sort((a, b) => a.start - b.start)
    const pos = player.livePosition()
    const next = dir > 0 ? (sorted.find((r) => r.start > pos + 1e-3) ?? sorted[0]) : ([...sorted].reverse().find((r) => r.start < pos - 1e-3) ?? sorted[sorted.length - 1])
    if (!next) return
    setSelections([...selections.filter((r) => r !== next), next])
    player.seek(next.start)
  }
  // ピッチの曲線の切り取り・コピー・貼り付け（ピッチの帯にフォーカスしているとき）
  const pitchClip = usePitchClipboard({
    edited,
    pitch: editing ? pitch : null,
    pitchTarget,
    selections,
    getPosition: player.livePosition,
    notify: (message) => setToast({ severity: 'info', message }),
  })
  /** フォーカスしている帯に効く、切り取り・コピー・貼り付け・選択範囲のみ残す */
  const onPitch = focusLane === 'pitch'
  // キーの割り当て（設定で変えたものと既定）
  const keymap = useMemo(() => resolveKeymap(settings.keymap, settings.ctrlS), [settings.keymap, settings.ctrlS])
  const clip = {
    cut: onPitch ? pitchClip.cut : cmd.cut,
    copy: onPitch ? pitchClip.copy : cmd.copy,
    paste: onPitch ? pitchClip.paste : cmd.paste,
    // 取り除くのは音声だけ（ピッチの帯では何もしない）
    remove: onPitch ? () => {} : cmd.remove,
    // 選択範囲のみ残すは、音声だけの操作
    trim: onPitch ? () => {} : cmd.trim,
    canTrim: !onPitch,
    hasClipboard: onPitch ? pitchClip.hasClipboard : cmd.hasClipboard,
  }

  // ↑↓: ピッチ帯で曲線を編集できるときは曲線（1 半音、Shift で 0.1 半音）、それ以外は加工のピッチ（1 半音、Shift で 12 半音）
  const pitchCurve = showPitch && editing && pitchTools.ready && !busy ? pitchTools.shift : undefined
  const nudge = editing && !busy ? (d: number) => setParams((p) => ({ ...p, semitones: Math.max(-24, Math.min(24, Math.round((p.semitones + d) * 100) / 100)) })) : undefined
  const pitchKey = (small: number, large: number) => (pitchCurve ? () => pitchCurve(small) : nudge ? () => nudge(large) : undefined)
  useShortcuts(keymap, {
    seekBack: () => seekBy(-1, false),
    seekForward: () => seekBy(1, false),
    seekBackFine: () => seekBy(-1, true),
    seekForwardFine: () => seekBy(1, true),
    seekStart: () => seekEdge('start'),
    seekEnd: () => seekEdge('end'),
    playPause: playback.togglePlay,
    undo: history.undo,
    redo: history.redo,
    cut: clip.cut,
    copy: clip.copy,
    paste: clip.paste,
    remove: clip.remove,
    trim: clip.trim,
    selectAll,
    clearSelection,
    open: () => picker.open(),
    saveProject: () => saveProjectFile(),
    exportAudio: () => openExport(),
    pitchUp: pitchKey(1, 1),
    pitchDown: pitchKey(-1, -1),
    pitchUpAlt: pitchKey(0.1, 12),
    pitchDownAlt: pitchKey(-0.1, -12),
    nextSelection: selections.length > 1 ? () => stepSelection(1) : undefined,
    prevSelection: selections.length > 1 ? () => stepSelection(-1) : undefined,
    addMarker,
    prevMarker: () => seekMarker(-1),
    nextMarker: () => seekMarker(1),
  })
  return { keymap, clip }
}
