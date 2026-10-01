import { faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { AppHeader as PevenAppHeader, HeaderIcon, type MenuGroup } from 'pevenmui'
import AppIcon from './AppIcon'
import { useT } from '../i18n/i18n'

interface Props {
  menus: MenuGroup[]
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
}

/** 上部のバー。PC は Windows 風の低いメニューバー、スマホは Android 風の上部バー。右端に元に戻す・やり直す */
export default function AppHeader({ menus, canUndo, canRedo, busy, onUndo, onRedo }: Props) {
  const t = useT()
  return (
    <PevenAppHeader
      title="WeVocalSynth"
      icon={<AppIcon size={16} />}
      menus={menus}
      actions={(mobile) => (
        <>
          <HeaderIcon small={!mobile} title={mobile ? t('common.undo') : `${t('common.undo')} (Ctrl+Z)`} icon={faRotateLeft} disabled={!canUndo || busy} onClick={onUndo} />
          <HeaderIcon small={!mobile} title={mobile ? t('common.redo') : `${t('common.redo')} (Ctrl+Y)`} icon={faRotateRight} disabled={!canRedo || busy} onClick={onRedo} />
        </>
      )}
    />
  )
}
