// 音声の書き出しのダイアログ（部品は wevocal-lib の ExportDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { ExportDialog as LibExportDialog, LabeledSelect } from 'wevocal-lib/react'
import { useT } from '../i18n/i18n'

export type { ExportSettings } from 'wevocal-lib/react'
/** ラベル付きのセレクトボックス（VideoExportDialog でも使う） */
export const Choice = LabeledSelect

/** 音声ファイルの書き出し。形式、音質、サンプルレート、チャンネル、範囲を選ぶ */
export default function ExportDialog(p: Omit<ComponentProps<typeof LibExportDialog>, 't'>) {
  const t = useT()
  return <LibExportDialog {...p} t={t} />
}
