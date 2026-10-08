// 時間のかかる処理を、処理中の印、進み具合、通知、中断付きで実行する
import { useRef, useState } from 'react'
import { markActivity } from '../debug/debugStats'
import { cancelDsp } from '../dsp/engine'
import { startJob, type JobKind } from '../progress/jobs'

/**
 * 時間のかかる処理を、処理中フラグ・進捗・エラー通知・中断付きで実行する。`label` は処理中に出す内容（「音声加工中…」など）。
 * `onStart` は処理を始める直前（再生の停止など）、`onError` は失敗時、`onCancel` は中断したときに呼ぶ。
 * 進み具合は、進んでいる処理の一覧（progress/jobs.ts。画面のゲージ）にも出す。
 *
 * 中断（`cancel`）すると、その場で処理中の表示を終え、DSP の Worker を止める。
 * 処理は渡された `signal` を見て、中断されていたら結果を使わない（履歴に積まない）こと。
 * DSP 以外の Worker を使う処理は、`signal` の abort で自分の Worker を止める
 */
export function useTask(onStart: () => void, onError: (e: unknown) => void, onCancel: () => void) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')
  const ctrl = useRef<AbortController | null>(null)
  /** 進んでいる処理の一覧での、今の処理 */
  const job = useRef<ReturnType<typeof startJob> | null>(null)

  const cancel = () => {
    const c = ctrl.current
    if (!c) return
    c.abort()
    cancelDsp()
    onCancel()
  }

  /** `kind` はゲージに出す大まかな種類 */
  const run = async (taskLabel: string, task: (signal: AbortSignal) => Promise<void>, kind: JobKind = 'process') => {
    const c = new AbortController()
    ctrl.current = c
    setBusy(true)
    setLabel(taskLabel)
    markActivity(`task ${taskLabel}`)
    setProgress(0)
    job.current?.end()
    const j = startJob(kind, taskLabel, cancel)
    job.current = j
    onStart()
    // 中断されたら、処理の終わりを待たずに抜ける
    const aborted = new Promise<void>((resolve) => c.signal.addEventListener('abort', () => resolve()))
    try {
      await Promise.race([task(c.signal), aborted])
    } catch (e) {
      if (!c.signal.aborted) onError(e)
    } finally {
      j.end()
      if (ctrl.current === c) {
        ctrl.current = null
        setBusy(false)
      }
    }
  }

  const update = (p: number) => {
    setProgress(p)
    job.current?.update(p)
  }

  return { busy, progress, label, setProgress: update, run, cancel }
}
