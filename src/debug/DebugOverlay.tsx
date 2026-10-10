// デバッグ表示（部品は PevenMUI。WeVocal Studio と共通）
import { DebugOverlay as PevenDebugOverlay } from 'pevenmui/debug'
import { APP_BUILD } from '../pwa/updateCheck'

export default function DebugOverlay() {
  return <PevenDebugOverlay build={APP_BUILD} />
}
