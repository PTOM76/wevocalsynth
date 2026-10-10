// 何も開いていないときの画面（部品は PevenMUI の EmptyState。WeVocal Studio と共通）
import { EmptyState as PevenEmptyState } from 'pevenmui'
import { faFolderOpen, faMicrophone, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../i18n/i18n'

/** ファイルを開く前の画面。ファイルを開くか、音を0から作るか、録音するか、最近使用したファイルを開き直す */
export function EmptyState(p: {
  onOpen: () => void
  onSynth: () => void
  /** 録音（録音できないブラウザでは渡さない） */
  onRecord?: () => void
  /** 最近使用したファイル（使えないブラウザや、1つもなければ出さない） */
  recent?: { supported: boolean; names: string[]; open: (i: number) => void }
}) {
  const t = useT()
  return (
    <PevenEmptyState
      message={t('empty.formats')}
      primary={{ label: t('empty.choose'), icon: faFolderOpen, onClick: p.onOpen }}
      actions={[{ label: t('synth.open'), icon: faWaveSquare, onClick: p.onSynth }, ...(p.onRecord ? [{ label: t('record.title'), icon: faMicrophone, onClick: p.onRecord }] : [])]}
      recent={p.recent?.supported ? { title: t('menu.recent'), names: p.recent.names, open: p.recent.open, more: (n) => t('empty.showMore', { n }), less: t('empty.showLess') } : undefined}
    />
  )
}
