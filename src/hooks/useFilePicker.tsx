import { useRef } from 'react'
import { pickOpenFile } from '../project/fileAccess'

/**
 * ファイル選択ダイアログ。`input` を画面のどこかに置き、`open()` で開く。
 * 使えるブラウザでは、フォルダを覚える選択画面（File System Access API）を使い、選んだファイルを最近使用したファイルに記録する
 */
export function useFilePicker(accept: string, onFile: (file: File) => void, description = '') {
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
  const open = async () => {
    const exts = accept.split(',').map((s) => s.trim()).filter((s) => s.startsWith('.'))
    const f = await pickOpenFile(exts, description)
    if (f) onFile(f)
    // 使えない環境では input で選ぶ（null はやめたとき）
    else if (f === undefined) ref.current?.click()
  }
  return { input, open: () => void open() }
}
