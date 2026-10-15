// 動画の書き出しのダイアログ（部品は converter の VideoExportDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import LibVideoExportDialog from '../../converter/src/VideoExportDialog'
import { videoHost } from '../audio/video'
import { useT } from '../i18n/i18n'

export type { VideoExportSettings } from '../../converter/src/VideoExportDialog'

export default function VideoExportDialog(p: Omit<ComponentProps<typeof LibVideoExportDialog>, 't' | 'host'>) {
  const t = useT()
  return <LibVideoExportDialog {...p} t={t} host={videoHost} />
}
