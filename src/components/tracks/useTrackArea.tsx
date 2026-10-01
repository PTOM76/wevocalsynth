import { useState } from 'react'
import type { useEditor } from '../../hooks/useEditor'
import type { View } from '../waveform/draw'
import { ContextMenu } from '../menu/MenuList'
import TrackPanel from './TrackPanel'
import RenameDialog from './RenameDialog'
import { trackMenuEntries } from './trackMenu'

/**
 * トラックの欄と、その右クリックメニュー・名前の変更のつなぎ込み（App から分けたもの）。
 * `panel(view)` を波形の上に、`overlays` を画面のどこかに置く
 */
export function useTrackArea(ed: ReturnType<typeof useEditor>, busy: boolean, meter: ((id: string) => AnalyserNode | null) | null) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const tr = ed.tracks

  const actions = {
    tracks: tr.tracks,
    activeId: tr.activeId,
    mix: tr.mix,
    busy,
    select: tr.select,
    duplicate: tr.duplicate,
    rename: setRenaming,
    splitStems: (id: string) => void ed.splitStems(id),
    mergeDown: (id: string) => void tr.mergeDown(id),
    mergeAll: () => void tr.mergeAll(),
    toggleMute: tr.toggleMute,
    toggleSolo: tr.toggleSolo,
    overlay: tr.overlay,
    toggleOverlay: tr.toggleOverlay,
    remove: tr.remove,
  }

  // トラックが2本以上あるときだけ出る（広げると波形付きの一覧、折りたたむとタブ）
  const panel = (view: View) => (
    <TrackPanel
      tracks={tr.tracks}
      activeId={tr.activeId}
      mix={tr.mix}
      view={view}
      disabled={busy}
      onSelect={tr.select}
      onToggleMute={tr.toggleMute}
      onToggleSolo={tr.toggleSolo}
      onContextMenu={(id, x, y) => setMenu({ id, x, y })}
      meter={meter}
    />
  )

  const overlays = (
    <>
      <ContextMenu position={menu} entries={menu ? trackMenuEntries(menu.id, actions) : []} onClose={() => setMenu(null)} />
      <RenameDialog
        name={renaming ? (tr.tracks.find((x) => x.id === renaming)?.name ?? '') : null}
        onClose={() => setRenaming(null)}
        onRename={(name) => renaming && tr.rename(renaming, name)}
      />
    </>
  )

  return { panel, overlays }
}
