// 設定と自動保存した作業を、指定したフォルダーにも写す（PWA を消しても戻せるように。memo/data-folder.md。処理は PevenMUI。WeVocal Studio と共通）。画面と自動保存の Worker の両方から使う
import { createDataFolder } from 'pevenmui/web'
import { idbGet } from './idb'
import { app } from '../appConfig'

// その場かぎりのもの（抽出のあとに落ちたかの印）は写さない
export const dataFolder = createDataFolder({ appId: app.id, idbGet, localPrefix: app.key(''), skipLocal: (key) => key.includes('extractGuard') })
export const { isMirroredKey, mirrorPut, mirrorDelete, mirrorClearWork, readMirroredWork, folderLink, linkFolder, mirroredSize, mirrorClearAll } = dataFolder
