import { Box, ButtonBase, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faEllipsis, faHeadphones, faLayerGroup, faPaste, faScissors, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../../i18n/i18n'

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
  const button = (icon: IconDefinition, label: string, onClick: (e: React.MouseEvent<HTMLElement>) => void, disabled = false) => (
    <ButtonBase
      key={label}
      disabled={disabled}
      onClick={onClick}
      sx={{ flexDirection: 'column', gap: 0.25, minWidth: 56, height: 44, px: 0.5, borderRadius: 1, color: 'text.primary', opacity: disabled ? 0.4 : 1 }}
    >
      <FontAwesomeIcon icon={icon} fontSize={15} />
      <Typography sx={{ fontSize: 10, lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</Typography>
    </ButtonBase>
  )
  return (
    <Box sx={{ display: 'flex', overflowX: 'auto', gap: 0.25, px: 0.5, py: 0.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {button(faHeadphones, t('mobileEdit.play'), p.playSelection)}
      {button(faScissors, t('mobileEdit.cut'), p.cut)}
      {button(faCopy, t('mobileEdit.copy'), p.copy)}
      {button(faPaste, t('mobileEdit.paste'), p.paste, !p.canPaste)}
      {button(faTrashCan, t('edit.delete'), p.remove)}
      {button(faLayerGroup, t('mobileEdit.toTrack'), p.toNewTrack)}
      {button(faEllipsis, t('mobileEdit.more'), (e) => {
        const r = e.currentTarget.getBoundingClientRect()
        p.more(r.left, r.top)
      })}
    </Box>
  )
}
