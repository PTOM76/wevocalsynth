// 選択範囲の開始と終了の入力欄（部品は PevenMUI の SelectionField。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { SelectionField as PevenSelectionField } from 'pevenmui'
import { useT } from '../i18n/i18n'

export default function SelectionField(p: Omit<ComponentProps<typeof PevenSelectionField>, 'labels'>) {
  const t = useT()
  return (
    <PevenSelectionField
      {...p}
      labels={{ selection: t('common.selection'), beats: (n) => t('selection.beats', { n }), start: t('clip.start'), end: t('clip.end'), saveOrDrag: t('selection.saveOrDrag'), folderSave: t('folder.save'), dragOut: t('selection.dragOut') }}
    />
  )
}
