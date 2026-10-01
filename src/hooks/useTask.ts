import { useState } from 'react'

/**
 * 時間のかかる処理を、処理中フラグ・進捗・エラー通知付きで実行する。`label` は処理中に出す内容（「音声加工中…」など）。
 * `onStart` は処理を始める直前（再生の停止など）、`onError` は失敗時に呼ぶ。
 */
export function useTask(onStart: () => void, onError: (e: unknown) => void) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')

  const run = async (taskLabel: string, task: () => Promise<void>) => {
    setBusy(true)
    setLabel(taskLabel)
    setProgress(0)
    onStart()
    try {
      await task()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return { busy, progress, label, setProgress, run }
}
