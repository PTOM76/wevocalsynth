// スマホの上部バー（プロジェクト名とメニュー）
import { faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { AppHeader as PevenAppHeader, HeaderIcon, type MenuGroup } from 'pevenmui'
import AppIcon from './AppIcon'
import { useT } from '../i18n/i18n'
import { app } from '../appConfig'
import { withKey } from '../commands'
import type { Keymap } from '../settings/keymap'

interface Props {
  menus: MenuGroup[]
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
  /** キーの割り当て（ツールチップに表記する） */
  keymap: Keymap
  /** スマホの上部バーに出すプロジェクト名（なければアプリ名）と、未保存の変更があるか */
  projectName?: string
  dirty?: boolean
}

/** 上部のバー。PC は Windows 風の低いメニューバー、スマホは Android 風の上部バー。右端に元に戻す・やり直す */
export default function AppHeader({ menus, canUndo, canRedo, busy, onUndo, onRedo, keymap, projectName, dirty }: Props) {
  const t = useT()
  return (
    <PevenAppHeader
      title={projectName ? (dirty ? '* ' : '') + projectName : app.name}
      icon={<AppIcon size={16} />}
      menus={menus}
      actions={(mobile) => (
        <>
          <HeaderIcon small={!mobile} title={mobile ? t('common.undo') : withKey(t('common.undo'), keymap, 'undo')} icon={faRotateLeft} disabled={!canUndo || busy} onClick={onUndo} />
          <HeaderIcon small={!mobile} title={mobile ? t('common.redo') : withKey(t('common.redo'), keymap, 'redo')} icon={faRotateRight} disabled={!canRedo || busy} onClick={onRedo} />
        </>
      )}
    />
  )
}
