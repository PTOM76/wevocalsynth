// 編集のコマンド（元に戻す、切り取りなど、選択）
import { defineCommands } from './types'

export const editCommands = defineCommands({
  undo: { label: 'common.undo', enabled: (c) => c.ed.history.canUndo && !c.ed.busy, run: (c) => c.ed.history.undo() },
  redo: { label: 'common.redo', enabled: (c) => c.ed.history.canRedo && !c.ed.busy, run: (c) => c.ed.history.redo() },
  history: { label: 'history.menu', enabled: (c) => !c.noClip, run: (c) => c.dialogs.open('history') },
  // 切り取りなどは、フォーカスしている帯（波形なら音声、ピッチなら曲線）に効く（ed.clip が振り分ける）
  cut: { label: 'edit.cut', enabled: (c) => !c.noSel, run: (c) => c.ed.clip.cut() },
  copy: { label: 'edit.copy', enabled: (c) => !c.noSel, run: (c) => c.ed.clip.copy() },
  paste: { label: 'edit.paste', enabled: (c) => !c.noClip && c.ed.clip.hasClipboard, run: (c) => c.ed.clip.paste() },
  remove: { label: 'edit.delete', enabled: (c) => !c.noSel, run: (c) => c.ed.clip.remove() },
  trim: { label: 'edit.trim', enabled: (c) => !c.noSel && c.ed.clip.canTrim, run: (c) => c.ed.clip.trim() },
  reverse: { label: 'edit.reverse', enabled: (c) => !c.noClip, run: (c) => c.ed.cmd.reverse() },
  insertSilence: { label: 'silence.menu', enabled: (c) => !c.noClip, run: (c) => c.dialogs.open('silence') },
  repeatSelection: { label: 'repeat.menu', enabled: (c) => !c.noSel, run: (c) => c.dialogs.open('repeat') },
  selectAll: { label: 'edit.selectAll', enabled: (c) => !c.noClip, run: (c) => c.ed.selectAll() },
  selectSounds: { label: 'soundSelect.menu', enabled: (c) => !c.noClip, run: (c) => c.dialogs.open('soundSelect') },
  clearSelection: { label: 'edit.clearSelection', enabled: (c) => !c.noSel, run: (c) => c.ed.clearSelection() },
})
