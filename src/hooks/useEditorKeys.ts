// キーの割り当てと、フォーカスしている帯（波形かピッチ）に効く切り取りなど。キーの処理はコマンド（src/commands/）
import { useMemo } from 'react'
import type { Clip, Range } from '../audio/types'
import type { usePlayer } from '../audio/usePlayer'
import { resolveKeymap } from '../settings/keymap'
import type { Settings } from '../settings/settings'
import type { useClipCommands } from './useClipCommands'
import type { Toast } from './useEditor'
import type { useLanes } from './useLanes'
import { usePitchClipboard } from './usePitchClipboard'
import type { usePitchTarget } from './usePitchTarget'

interface Options {
  settings: Settings
  edited: Clip | null
  editing: boolean
  pitch: Float32Array | null
  pitchTarget: ReturnType<typeof usePitchTarget>
  focusLane: ReturnType<typeof useLanes>['focusLane']
  cmd: ReturnType<typeof useClipCommands>
  selections: Range[]
  player: ReturnType<typeof usePlayer>
  setToast: (toast: Toast | null) => void
}

/** キーの割り当て（設定で変えたものと既定）と、フォーカスしている帯（波形かピッチ）に効く切り取り、コピー、貼り付け */
export function useEditorKeys(o: Options) {
  const { settings, edited, editing, pitch, pitchTarget, focusLane, cmd, selections, player, setToast } = o
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

  return { keymap, clip }
}
