import { useRef } from 'react'

/** ファイル選択ダイアログ。`input` を画面のどこかに置き、`open()` で開く */
export function useFilePicker(accept: string, onFile: (file: File) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) onFile(f)
        // 同じファイルを続けて選んでも change が起きるように空にする
        e.target.value = ''
      }}
    />
  )
  return { input, open: () => ref.current?.click() }
}
