import { useEffect, useState } from 'react'
import { clearRecent, listRecent, onRecentChange, openRecent, type RecentFile } from '../project/fileAccess'

/** 最近使用したファイル（メニューの「最近使用したファイル」）。開けなかったら `onMissing` */
export function useRecentFiles(onFile: (f: File) => void, onMissing: (name: string) => void) {
  const [list, setList] = useState<RecentFile[]>([])
  useEffect(() => {
    const load = () => void listRecent().then(setList)
    load()
    return onRecentChange(load)
  }, [])
  return {
    names: list.map((r) => r.name),
    open: (i: number) => {
      const r = list[i]
      if (r) void openRecent(r).then((f) => (f ? onFile(f) : onMissing(r.name)))
    },
    clear: () => void clearRecent(),
  }
}
