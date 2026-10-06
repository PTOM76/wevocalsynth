import { faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { AppHeader as PevenAppHeader, HeaderIcon, type MenuGroup } from 'pevenmui'
import AppIcon from './AppIcon'
import { useT } from '../i18n/i18n'
import { app } from '../appConfig'

interface Props {
  menus: MenuGroup[]
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
  /** スマホの上部バーに出すプロジェクト名（なければアプリ名）と、未保存の変更があるか */
  projectName?: string
  dirty?: boolean
}

/** 上部のバー。PC は Windows 風の低いメニューバー、スマホは Android 風の上部バー。右端に元に戻す・やり直す */
export default function AppHeader({ menus, canUndo, canRedo, busy, onUndo, onRedo, projectName, dirty }: Props) {
  const t = useT()
  return (
    <PevenAppHeader
      title={projectName ? (dirty ? '* ' : '') + projectName : app.name}
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
