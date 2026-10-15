// 動画の書き出しを追加機能「変換」に頼む（手順は converter の host.ts。WeVocal Studio と共通）
import { createVideoHost } from '../../converter/src/host'
import { loadAddon } from '../addons/addons'

export type { VideoContainer, VideoLook, WaveStyle } from '../../converter/src/host'
export { VIDEO_MIME, VIDEO_EXT } from '../../converter/src/host'

/** 作る手順（使う前に導入を確かめる。useVideoExport の `ensure('converter')`） */
export const videoHost = createVideoHost((id) => loadAddon(id))
export const { canEncodeVideo, renderPreview, renderVideo } = videoHost
