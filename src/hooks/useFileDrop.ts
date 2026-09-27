import { useEffect, useRef, useState } from 'react'

/** ページ上のどこにファイルをドロップしても `onFile` を呼ぶ。ドラッグ中かどうかを返す */
export function useFileDrop(onFile: (file: File) => void) {
  const [dragOver, setDragOver] = useState(false)
  const onFileRef = useRef(onFile)
  onFileRef.current = onFile

  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files[0]
      if (file) onFileRef.current(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragOver
}
