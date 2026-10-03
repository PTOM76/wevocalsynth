import { useEffect, useState } from 'react'
import { canPickFiles, clearRecent, listRecent, onRecentChange, openRecent, rememberDropped, type RecentFile } from '../project/fileAccess'

/** 最近使用したファイル（メニューの「最近使用したファイル」）。開けなかったら `onMissing` */
export function useRecentFiles(onFile: (f: File) => void, onMissing: (name: string) => void) {
  const [list, setList] = useState<RecentFile[]>([])
  useEffect(() => {
    const load = () => void listRecent().then(setList)
    load()
    return onRecentChange(load)
  }, [])
  // ドロップしたファイルも記録する（開く処理は useFileDrop が行う。ここは参照を取り出して記録するだけ）
  useEffect(() => {
    if (!canPickFiles()) return
    window.addEventListener('drop', rememberDropped, true)
    return () => window.removeEventListener('drop', rememberDropped, true)
  }, [])
  return {
    /** このブラウザで使えるか（使えなければメニューに出さない） */
    supported: canPickFiles(),
    names: list.map((r) => r.name),
    open: (i: number) => {
      const r = list[i]
      if (r) void openRecent(r).then((f) => (f ? onFile(f) : onMissing(r.name)))
    },
    clear: () => void clearRecent(),
  }
}
