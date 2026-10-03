import { useEffect, useRef } from 'react'

/** インストールした PWA として開いているか（ブラウザのタブではない） */
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

/**
 * 閉じる（再読み込みする）ときに、ブラウザの確認ダイアログを出す。`dirty()` が真のときだけ出す。
 * ダイアログの文言はブラウザが決める（独自の文言は出せない）
 */
export function useLeaveGuard(enabled: boolean, dirty: () => boolean) {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!enabled) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current()) return
      e.preventDefault()
      // 古いブラウザは returnValue を入れないと確認を出さない
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [enabled])
}
