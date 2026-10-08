// ファイルのコマンド（開く、保存、書き出し、設定）
import { canSaveToFolder } from 'pevenmui/web'
import { defineCommands, ready, selected } from './types'

export const fileCommands = defineCommands({
  open: { label: 'menu.open', enabled: (c) => !c.ed.busy, run: (c) => c.ed.picker.open() },
  addTrack: { label: 'track.addMenu', enabled: ready, run: (c) => c.ed.addPicker.open() },
  saveProject: { label: 'menu.saveProject', enabled: ready, run: (c) => void c.ed.saveProjectFile() },
  saveProjectAs: { label: 'menu.saveProjectAs', enabled: ready, run: (c) => void c.ed.saveProjectFile(true) },
  exportAudio: { label: 'menu.export', enabled: ready, run: (c) => c.ed.openExport() },
  // 右クリックでは、選択範囲があれば選択範囲で開く（ExportDialog）
  exportRange: { label: (c, t) => t(c.ed.selection ? 'context.exportSelection' : 'menu.export'), enabled: ready, run: (c) => c.ed.openExport() },
  // 追加機能「変換」を導入しているときだけ
  exportVideo: { label: 'menu.exportVideo', visible: (c) => c.ed.video.available, enabled: ready, run: (c) => void c.ed.video.openDialog() },
  saveToFolder: { label: 'folder.save', visible: () => canSaveToFolder(), enabled: selected, keyOnlyWhenEnabled: true, run: (c) => void c.selectionExport.saveSelectionToFolder() },
  saveManyToFolder: {
    label: (c, t) => t('folder.saveMany', { n: c.ed.selections.length }),
    visible: (c) => canSaveToFolder() && c.ed.selections.length > 1,
    run: (c) => void c.selectionExport.saveSelectionsToFolder(),
  },
  settings: { label: 'menu.settings', run: (c) => c.dialogs.open('settings') },
})
