// 歌から一音ずつ切り出す（手順は analyzer の kanaCut.ts。WeVocal Studio と共通）
import { createKanaHost } from '../../analyzer/src/kanaCut'
import { loadAddon } from '../addons/addons'

export { audibleMorae, usableMorae, sliceMora, exportMorae, type MoraMark, type TranscribeOptions, type LyricsSegment } from '../../analyzer/src/kanaCut'
export const { transcribeRange, findMorae } = createKanaHost((id) => loadAddon(id))
