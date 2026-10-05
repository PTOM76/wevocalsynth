import type { MessageKey } from '../i18n/i18n'
import type { CtrlSAction } from './settings'

/**
 * キーボードショートカットの割り当て。操作ごとに既定のキーを持ち、設定で変えたものだけを `keymap` に保存する。
 * キーは `e.code`（配列によらない位置）に、修飾キーを Ctrl（Mac の Cmd も）、Alt、Shift の順に `+` でつないだもの（`Ctrl+Shift+KeyS`）
 */

export type ActionId =
  | 'playPause' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'remove' | 'selectAll' | 'clearSelection'
  | 'open' | 'saveProject' | 'exportAudio'
  | 'seekBack' | 'seekForward' | 'seekBackFine' | 'seekForwardFine' | 'seekStart' | 'seekEnd'
  | 'prevMarker' | 'nextMarker' | 'addMarker'
  | 'pitchUp' | 'pitchDown' | 'pitchUpAlt' | 'pitchDownAlt' | 'nextSelection' | 'prevSelection'
  | 'playSelection' | 'toggleLoop' | 'apply' | 'toNewTrack' | 'saveToFolder' | 'trim' | 'selectSounds'

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
  { id: 'open', label: 'menu.open', keys: ['Ctrl+KeyO'] },
  { id: 'saveProject', label: 'menu.saveProject', keys: ['Ctrl+KeyS'] },
  { id: 'exportAudio', label: 'menu.export', keys: ['Ctrl+Shift+KeyS', 'Ctrl+KeyE'] },
]

/** 設定に保存する、既定から変えた割り当て（空の配列はキーなし） */
export type KeymapOverrides = Partial<Record<ActionId, string[]>>
export type Keymap = Record<ActionId, string[]>

/** 既定のキー。`ctrlS` が書き出しなら、Ctrl+S と Ctrl+Shift+S を入れ替える */
export function defaultKeys(id: ActionId, ctrlS: CtrlSAction): string[] {
  const keys = ACTIONS.find((a) => a.id === id)?.keys ?? []
  if (ctrlS !== 'export') return keys
  if (id === 'saveProject') return ['Ctrl+Shift+KeyS']
  if (id === 'exportAudio') return ['Ctrl+KeyS', 'Ctrl+KeyE']
  return keys
}

export function resolveKeymap(overrides: KeymapOverrides, ctrlS: CtrlSAction): Keymap {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, overrides[a.id] ?? defaultKeys(a.id, ctrlS)])) as Keymap
}

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'])

/** 押したキーの組み合わせ。修飾キーだけを押したときは null */
export function comboOf(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.code].filter(Boolean).join('+')
}

/** 組み合わせに割り当てた操作 */
export function actionOf(keymap: Keymap, combo: string): ActionId | undefined {
  return ACTIONS.find((a) => keymap[a.id].includes(combo))?.id
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Space: 'Space', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlRo: '\\', IntlYen: '¥',
}

/** 表示する名前（`Ctrl+Shift+KeyS` → `Ctrl+Shift+S`） */
export function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map((p) => KEY_NAMES[p] ?? p.replace(/^Key|^Digit|^Numpad(?=\d)/, ''))
    .join('+')
}

/** 操作のキーの表示（最初のもの。なければ undefined。メニューの右に出す） */
export const keyLabelOf = (keymap: Keymap, id: ActionId) => (keymap[id][0] ? comboLabel(keymap[id][0]) : undefined)
