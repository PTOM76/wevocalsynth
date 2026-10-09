// 起動時の処理（自動保存からの復元、ファイルから起動、抽出から戻る）
import { useEffect, useRef } from 'react'
import { rememberLaunched } from 'pevenmui/web'
import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import { t } from '../i18n/i18n'
import { cleanBootPending, takeCleanResult } from '../project/cleanExtract'
import type { Project } from '../project/projectFile'
import { slot } from '../project/windowSlot'
import { useAutosave } from './useAutosave'
import type { Toast } from './useEditor'

interface Options {
  autoRestore: boolean
  /** 自動保存する作業の状態 */
  state: Parameters<typeof useAutosave>[1]
  params: EditParams
  openClip: (clip: Clip, name: string, project: Project | null, ids?: string[]) => void
  loadFile: (file: File) => unknown
  setToast: (toast: Toast | null) => void
  /** 抽出から戻ったとき、加工の欄をボーカルの設定にする */
  applyVocalParams: () => void
}

/** 作業状態の自動保存と起動時の復元、ファイルから起動したとき、メモリが足りないときの抽出から戻ったときの処理 */
export function useStartup({ autoRestore, state, params, openClip, loadFile, setToast, applyVocalParams }: Options) {
// ファイルから起動したか（下の launchQueue）、メモリが足りないときの抽出から戻ったか。真なら起動時の復元をしない
const launchedRef = useRef(cleanBootPending())
// 作業状態の自動保存と、起動時の復元（上限を超えて開いたウィンドウは、保存先の枠がないので保存しない。project/windowSlot.ts）
useAutosave(
  autoRestore && slot !== null,
  state,
  params,
  (project, ids) => {
    // ファイルから起動した（OS でダブルクリックした）ときは、そのファイルを優先して復元しない
    if (launchedRef.current) return
    openClip(project.tracks[project.active].edited, project.fileName, project, ids)
    setToast({ severity: 'info', message: t('toast.restored') })
  },
  (e) => console.warn('autosave failed', e),
)

// 上限を超えて開いたウィンドウでは、自動保存されないことを知らせる
useEffect(() => {
  if (autoRestore && slot === null) setToast({ severity: 'info', message: t('window.noAutosave') })
  // 起動時に1回だけ
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

// OS でファイルをダブルクリックして起動したとき（インストールした PWA の File Handling。vite.config.ts の file_handlers）
const loadFileRef = useRef(loadFile)
loadFileRef.current = loadFile
useEffect(() => {
  const queue = (window as Window & { launchQueue?: { setConsumer(f: (p: { files?: { getFile(): Promise<File> }[] }) => void): void } }).launchQueue
  queue?.setConsumer((p) => {
    const handle = p.files?.[0]
    if (!handle) return
    launchedRef.current = true
    void handle.getFile().then((f) => {
      rememberLaunched(handle, f)
      void loadFileRef.current(f)
    })
  })
}, [])

// メモリが足りないときの抽出（再読み込みして行う）から戻ったら、結果を反映した作業を開く（project/cleanExtract.ts）
useEffect(() => {
  if (!cleanBootPending()) return
  void takeCleanResult().then((r) => {
    if (!r) return
    openClip(r.project.tracks[r.project.active].edited, r.project.fileName, r.project)
    if (r.vocals) applyVocalParams()
    setToast(r.extracted ? { severity: 'success', message: t('toast.extracted') } : { severity: 'info', message: t('toast.restored') })
  })
  // 起動時に1回だけ
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
}
