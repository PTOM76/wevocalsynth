import { useEffect, useRef } from 'react'

/** ドラッグしているものがファイルか（トラックの並び替えなど、画面の中のドラッグは扱わない） */
const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

/**
 * ページ上のどこにファイルをドロップしても `onFile` を呼ぶ。
 * 受け付けることは画面の案内ではなく、マウスカーソル（コピーの形）で示す
 */
export function useFileDrop(onFile: (file: File) => void) {
  const onFileRef = useRef(onFile)
  onFileRef.current = onFile

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) onFileRef.current(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
}
