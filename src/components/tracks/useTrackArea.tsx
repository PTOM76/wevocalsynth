import { useState } from 'react'
import type { useEditor } from '../../hooks/useEditor'
import type { View } from '../waveform/draw'
import { ContextMenu } from '../menu/MenuList'
import TrackPanel from './TrackPanel'
import RenameDialog from './RenameDialog'
import { multiTrackMenuEntries, trackMenuEntries } from './trackMenu'
import type { PickMods } from './useTrackDrag'

/**
 * トラックの欄と、その右クリックメニュー・名前の変更のつなぎ込み（App から分けたもの）。
 * `panel(view)` を波形の上に、`overlays` を画面のどこかに置く
 */
export function useTrackArea(ed: ReturnType<typeof useEditor>, busy: boolean, meter: ((id: string) => AnalyserNode | null) | null) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const tr = ed.tracks
  // 複数選んだトラック（右クリックメニューでまとめて操作する対象）。編集するのは今までどおり選んでいる1本だけ。
  // 消えたトラックは除き、選んでいるトラックは必ず含める
  const [pickedRaw, setPicked] = useState<ReadonlySet<string>>(new Set())
  const picked = new Set([...pickedRaw].filter((id) => tr.tracks.some((x) => x.id === id)))
  picked.add(tr.activeId)

  /** 押したとき: そのまま押せば1本だけ選んで編集する。Ctrl は足す・外す、Shift は選んでいるトラックからの範囲 */
  const select = (id: string, mods: PickMods) => {
    if (mods.shift) {
      const a = tr.tracks.findIndex((x) => x.id === tr.activeId)
      const b = tr.tracks.findIndex((x) => x.id === id)
      setPicked(new Set(tr.tracks.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id)))
      return
    }
    if (mods.ctrl) {
      // 選んでいる（編集している）トラックは外せない
      if (id === tr.activeId) return
      const n = new Set(picked)
      if (!n.delete(id)) n.add(id)
      setPicked(n)
      return
    }
    setPicked(new Set([id]))
    tr.select(id)
  }

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
    mergeMany: (ids: string[]) => void tr.mergeMany(ids),
    setMuteMany: tr.setMuteMany,
    setSoloMany: tr.setSoloMany,
    removeMany: tr.removeMany,
  }

  /** 複数選んだトラックの上で右クリックしたらまとめての操作、それ以外はそのトラックの操作 */
  const menuFor = (id: string) => (picked.size > 1 && picked.has(id) ? multiTrackMenuEntries(tr.tracks.filter((x) => picked.has(x.id)).map((x) => x.id), actions) : trackMenuEntries(id, actions))

  // トラックが2本以上あるときだけ出る（広げると波形付きの一覧、折りたたむとタブ）
  const panel = (view: View) => (
    <TrackPanel
      tracks={tr.tracks}
      activeId={tr.activeId}
      mix={tr.mix}
      view={view}
      disabled={busy}
      onSelect={select}
      picked={picked}
      onMove={tr.move}
      onToggleMute={tr.toggleMute}
      onToggleSolo={tr.toggleSolo}
      onContextMenu={(id, x, y) => setMenu({ id, x, y })}
      meter={meter}
    />
  )

  const overlays = (
    <>
      <ContextMenu position={menu} entries={menu ? menuFor(menu.id) : []} onClose={() => setMenu(null)} />
      <RenameDialog
        name={renaming ? (tr.tracks.find((x) => x.id === renaming)?.name ?? '') : null}
        onClose={() => setRenaming(null)}
        onRename={(name) => renaming && tr.rename(renaming, name)}
      />
    </>
  )

  return { panel, overlays }
}
