import { useEffect, useRef } from 'react'
import { PROJECT_EXT, saveProject, type Project } from '../project/projectFile'
import { clearAutosave, loadAutosave, saveAutosave } from '../project/autosave'

/** 編集が止まってから自動保存するまでの待ち時間（ミリ秒） */
const SAVE_DELAY_MS = 1500

/**
 * 作業状態を IndexedDB に自動保存し、起動時に復元する。
 * 起動時の復元が終わるまでは保存しない（前回の作業を空の状態で上書きしないため）。
 * 無効にしたら保存済みのデータも消す。
 */
export function useAutosave(
  enabled: boolean,
  project: Project | null,
  onRestore: (file: File) => Promise<void>,
  onError: (e: unknown) => void,
) {
  const restoredRef = useRef(false)
  const fnRef = useRef({ onRestore, onError })
  fnRef.current = { onRestore, onError }

  // 起動時に1回だけ復元する
  useEffect(() => {
    if (restoredRef.current) return
    if (!enabled) {
      restoredRef.current = true
      return
    }
    loadAutosave()
      .then((blob) => (blob ? fnRef.current.onRestore(new File([blob], `autosave${PROJECT_EXT}`)) : undefined))
      .catch((e) => fnRef.current.onError(e))
      .finally(() => {
        restoredRef.current = true
      })
    // 起動時の設定値だけで判断する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 無効にしたら保存済みのデータを消す
  useEffect(() => {
    if (!enabled) void clearAutosave().catch(() => {})
  }, [enabled])

  // 編集が落ち着いたら保存する
  useEffect(() => {
    if (!enabled || !project || !restoredRef.current) return
    const timer = setTimeout(() => {
      saveProject(project)
        .then(saveAutosave)
        .catch((e) => fnRef.current.onError(e))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, project])
}
