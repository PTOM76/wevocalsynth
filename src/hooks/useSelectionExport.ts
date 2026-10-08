// 選択範囲の書き出し（外へのドラッグ、フォルダーへの保存）と、書き出しの保存先フォルダー
import { useEffect, useState } from 'react'
import { useStableFn } from 'pevenmui'
import { canSaveToFolder, chooseSaveFolder, saveToFolder, savedFolderName } from 'pevenmui/web'
import { encodeWav } from 'wevocal-lib'
import { finishClip } from '../audio/finish'
import { sliceRanges } from '../audio/multiRange'
import type { Range } from '../audio/types'
import { t } from '../i18n/i18n'
import { useAppSettings } from '../settings/settings'
import type { useEditor } from './useEditor'

/** 選択範囲の書き出し（外へのドラッグ、フォルダーへの保存）と、書き出しの保存先フォルダー */
export function useSelectionExport(ed: ReturnType<typeof useEditor>) {
  const { settings } = useAppSettings()
  const { edited, editing, selection } = ed
  // 選択範囲を外へドラッグして書き出すときの WAV（選んでいるトラックの加工後。名前は「書き出し名_開始ms.wav」。: は DownloadURL の区切りなので除く）
  const dragSelectionFile = useStableFn(() => {
    if (!edited || !selection) return null
    const name = `${ed.exportName.replace(/[:\\/]/g, '_')}_${Math.round(selection.start * 1000)}ms.wav`
    return { name, blob: encodeWav(finishClip(sliceRanges(edited, [selection]), finishOpts)) }
  })
  // 書き出しの仕上げ（ノーマライズ、両端のフェード）。フォルダーへの保存と外へのドラッグにもかける
  const finishOpts = { normalize: settings.exportNormalize, fadeMs: settings.exportFadeMs }
  // フォルダーへの保存に失敗したら、理由を出す（黙って何も起きないと原因が分からない）
  const folderFailed = (e: unknown) => ed.setToast({ severity: 'error', message: t('folder.failed', { error: String(e) }) })
  // 選択範囲を決めたフォルダーへ保存する（初回はフォルダーを選ぶ。名前は「書き出し名_連番.wav」）
  const saveSelectionToFolder = useStableFn(async () => {
    if (!edited || !selection) return
    const r = await saveToFolder('export', ed.exportName, '.wav', encodeWav(finishClip(sliceRanges(edited, [selection]), finishOpts))).catch((e) => (folderFailed(e), null))
    if (r) ed.setToast({ severity: 'success', message: t('folder.saved', { name: r.name, folder: r.folder }) })
  })
  // すべての選択範囲を、時間の順に 1 つずつ別のファイルにして保存する（「無音で区切って選択」のあとなど）
  const saveSelectionsToFolder = useStableFn(async () => {
    if (!edited || ed.selections.length < 2) return
    let last: { folder: string; name: string } | null = null
    let count = 0
    for (const r of [...ed.selections].sort((a, b) => a.start - b.start)) {
      const saved = await saveToFolder('export', ed.exportName, '.wav', encodeWav(finishClip(sliceRanges(edited, [r]), finishOpts))).catch((e) => (folderFailed(e), null))
      if (!saved) break
      last = saved
      count++
    }
    if (last) ed.setToast({ severity: 'success', message: t('folder.savedMany', { n: count, folder: last.folder }) })
  })
  // 無音で区切って選んだら、件数と次の操作（新しいトラックへ、別々にフォルダーへ保存）を通知に出す
  const onSoundsSelected = (rs: Range[]) => {
    if (!editing) return
    ed.setSelections(rs)
    if (!rs.length) return
    ed.setToast({
      severity: 'info',
      message: t('soundSelect.selected', { n: rs.length }),
      actions: [
        { label: t('track.copySelection'), onClick: () => ed.tracks.fromSelection(rs, false) },
        ...(canSaveToFolder() && rs.length > 1 ? [{ label: t('folder.saveManyShort'), onClick: () => void saveSelectionsToFolder() }] : []),
      ],
    })
  }
  // 書き出しの保存先フォルダー（Chrome・Edge。編集ソフトのように、ダイアログでフォルダーとファイル名を決める）。開くたびに覚えている名前を読む
  const exportToFolder = canSaveToFolder()
  const [exportFolder, setExportFolder] = useState<string | null>(null)
  useEffect(() => {
    if (exportToFolder && (ed.exportOpen || ed.video.open)) void savedFolderName('export').then(setExportFolder)
  }, [exportToFolder, ed.exportOpen, ed.video.open])
  return {
    dragSelectionFile,
    finishOpts,
    folderFailed,
    saveSelectionToFolder,
    saveSelectionsToFolder,
    onSoundsSelected,
    /** 書き出しのダイアログに渡す保存先フォルダー（使えないブラウザでは undefined） */
    exportFolder: exportToFolder ? { name: exportFolder, choose: (win: Window | null) => void chooseSaveFolder('export', win ?? window).then((n) => n && setExportFolder(n), folderFailed) } : undefined,
  }
}
