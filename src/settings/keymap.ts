// Synth の操作の一覧と既定のキー
import { resolveKeymap as resolve, type Keymap as PevenKeymap, type KeymapOverrides as PevenOverrides } from 'pevenmui'
import type { MessageKey } from '../i18n/i18n'
import type { CtrlSAction } from './settings'

/**
 * Synth の操作の一覧と既定のキー。割り当ての仕組み（キーの読み取り、表示の名前、設定の画面、keydown）は PevenMUI の keymap。
 * 設定で変えたものだけを `keymap` に保存する
 */
export { comboOf, comboLabel, actionOf, keyLabelOf } from 'pevenmui'

export type ActionId =
  | 'playPause' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'remove' | 'selectAll' | 'clearSelection'
  | 'open' | 'saveProject' | 'exportAudio'
  | 'seekBack' | 'seekForward' | 'seekBackFine' | 'seekForwardFine' | 'seekStart' | 'seekEnd'
  | 'prevMarker' | 'nextMarker' | 'addMarker'
  | 'pitchUp' | 'pitchDown' | 'pitchUpAlt' | 'pitchDownAlt' | 'nextSelection' | 'prevSelection'
  | 'playSelection' | 'toggleLoop' | 'apply' | 'toNewTrack' | 'saveToFolder' | 'newWindow' | 'trim' | 'selectSounds'

export interface ActionInfo {
  id: ActionId
  label: MessageKey
  keys: string[]
}

/** 操作の一覧（設定の画面に出す順）。保存と書き出しの既定は `ctrlS` で入れ替わる（`defaultKeys`） */
export const ACTIONS: ActionInfo[] = [
  { id: 'playPause', label: 'play.playPause', keys: ['Space'] },
  { id: 'playSelection', label: 'play.playSelection', keys: [] },
  { id: 'toggleLoop', label: 'play.repeat', keys: [] },
  { id: 'seekBack', label: 'key.seekBack', keys: ['ArrowLeft'] },
  { id: 'seekForward', label: 'key.seekForward', keys: ['ArrowRight'] },
  { id: 'seekBackFine', label: 'key.seekBackFine', keys: ['Shift+ArrowLeft'] },
  { id: 'seekForwardFine', label: 'key.seekForwardFine', keys: ['Shift+ArrowRight'] },
  { id: 'seekStart', label: 'play.toStart', keys: ['Home'] },
  { id: 'seekEnd', label: 'play.toEnd', keys: ['End'] },
  { id: 'addMarker', label: 'marker.add', keys: ['KeyM'] },
  { id: 'prevMarker', label: 'marker.prev', keys: ['Ctrl+ArrowLeft'] },
  { id: 'nextMarker', label: 'marker.next', keys: ['Ctrl+ArrowRight'] },
  { id: 'undo', label: 'common.undo', keys: ['Ctrl+KeyZ'] },
  { id: 'redo', label: 'common.redo', keys: ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ'] },
  { id: 'cut', label: 'edit.cut', keys: ['Ctrl+KeyX'] },
  { id: 'copy', label: 'edit.copy', keys: ['Ctrl+KeyC'] },
  { id: 'paste', label: 'edit.paste', keys: ['Ctrl+KeyV'] },
  { id: 'remove', label: 'edit.delete', keys: ['Delete'] },
  { id: 'trim', label: 'edit.trim', keys: [] },
  { id: 'selectAll', label: 'edit.selectAll', keys: ['Ctrl+KeyA'] },
  { id: 'clearSelection', label: 'edit.clearSelection', keys: ['Escape'] },
  { id: 'selectSounds', label: 'soundSelect.menu', keys: [] },
  { id: 'nextSelection', label: 'key.nextSelection', keys: ['Tab'] },
  { id: 'prevSelection', label: 'key.prevSelection', keys: ['Shift+Tab'] },
  { id: 'pitchUp', label: 'key.pitchUp', keys: ['ArrowUp'] },
  { id: 'pitchDown', label: 'key.pitchDown', keys: ['ArrowDown'] },
  { id: 'pitchUpAlt', label: 'key.pitchUpAlt', keys: ['Shift+ArrowUp'] },
  { id: 'pitchDownAlt', label: 'key.pitchDownAlt', keys: ['Shift+ArrowDown'] },
  { id: 'apply', label: 'key.apply', keys: [] },
  { id: 'toNewTrack', label: 'key.toNewTrack', keys: [] },
  { id: 'saveToFolder', label: 'folder.save', keys: [] },
  // 既定のキーはない（Ctrl+Shift+N はブラウザのシークレットウィンドウと重なる）
  { id: 'newWindow', label: 'menu.newWindow', keys: [] },
  { id: 'open', label: 'menu.open', keys: ['Ctrl+KeyO'] },
  { id: 'saveProject', label: 'menu.saveProject', keys: ['Ctrl+KeyS'] },
  { id: 'exportAudio', label: 'menu.export', keys: ['Ctrl+Shift+KeyS', 'Ctrl+KeyE'] },
]

/** 設定に保存する、既定から変えた割り当て（空の配列はキーなし） */
export type KeymapOverrides = PevenOverrides<ActionId>
export type Keymap = PevenKeymap<ActionId>

/** 既定のキー。`ctrlS` が書き出しなら、Ctrl+S と Ctrl+Shift+S を入れ替える */
export function defaultKeys(id: ActionId, ctrlS: CtrlSAction): string[] {
  const keys = ACTIONS.find((a) => a.id === id)?.keys ?? []
  if (ctrlS !== 'export') return keys
  if (id === 'saveProject') return ['Ctrl+Shift+KeyS']
  if (id === 'exportAudio') return ['Ctrl+KeyS', 'Ctrl+KeyE']
  return keys
}

export const resolveKeymap = (overrides: KeymapOverrides, ctrlS: CtrlSAction): Keymap => resolve(ACTIONS, overrides, (id) => defaultKeys(id, ctrlS))
