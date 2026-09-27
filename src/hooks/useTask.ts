import { useState } from 'react'

/**
 * 時間のかかる処理を、処理中フラグ・進捗・エラー通知付きで実行する。
 * `onStart` は処理を始める直前（再生の停止など）、`onError` は失敗時に呼ぶ。
 */
export function useTask(onStart: () => void, onError: (e: unknown) => void) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
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

  return { busy, progress, setProgress, run }
}
