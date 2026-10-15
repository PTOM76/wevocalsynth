// 名前の変更のダイアログ（部品は PevenMUI の RenameDialog。WeVocal Studio と共通）
import { RenameDialog as PevenRenameDialog } from 'pevenmui'
import { useT } from '../../i18n/i18n'

/** 名前の変更（トラック、プロジェクト）。`name` が null なら閉じている。`title` を省くとトラックの名前の変更 */
export default function RenameDialog(p: { name: string | null; title?: string; onClose: () => void; onRename: (name: string) => void }) {
  const t = useT()
  return <PevenRenameDialog {...p} title={p.title ?? t('track.rename')} />
}
