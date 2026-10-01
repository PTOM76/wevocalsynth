import { UpdatePrompt as PevenUpdatePrompt } from 'pevenmui/pwa'
import { APP_BUILD } from '../pwa/updateCheck'

/**
 * 新しい版が公開されたときの通知。勝手に入れ替えると作業中に再読み込みされるため、
 * 利用者が「更新」を押したときだけ切り替える（作業は自動保存から復元される）
 */
export default function UpdatePrompt() {
  return <PevenUpdatePrompt build={APP_BUILD} />
}
