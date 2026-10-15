// スマホで範囲を選んだときの編集のボタンの列（部品は PevenMUI の EditBar。ここは並べるボタンを決める）
import { faCopy, faEllipsis, faHeadphones, faLayerGroup, faPaste, faScissors, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { EditBar } from 'pevenmui'
import { useT } from '../i18n/i18n'

interface Props {
  playSelection: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  canPaste: boolean
  remove: () => void
  toNewTrack: () => void
  /** 右クリックと同じメニューを、押したボタンの位置に開く */
  more: (x: number, y: number) => void
}

/**
 * スマホの新しい画面で、範囲を選んだときに波形の下に出す編集の列（memo/mobile-ui.md の 4.1）。
 * よく使う操作をボタンにし、残りは「⋯」（右クリックと同じメニュー）にまとめる。入りきらなければ横にスクロールする
 */
export default function MobileEditBar(p: Props) {
  const t = useT()
  return (
    <EditBar
      items={[
        { label: t('mobileEdit.play'), icon: faHeadphones, onClick: p.playSelection },
        { label: t('mobileEdit.cut'), icon: faScissors, onClick: p.cut },
        { label: t('mobileEdit.copy'), icon: faCopy, onClick: p.copy },
        { label: t('mobileEdit.paste'), icon: faPaste, onClick: p.paste, disabled: !p.canPaste },
        { label: t('edit.delete'), icon: faTrashCan, onClick: p.remove },
        { label: t('mobileEdit.toTrack'), icon: faLayerGroup, onClick: p.toNewTrack },
        {
          label: t('mobileEdit.more'),
          icon: faEllipsis,
          onClick: (e) => {
            const r = e.currentTarget.getBoundingClientRect()
            p.more(r.left, r.top)
          },
        },
      ]}
    />
  )
}
