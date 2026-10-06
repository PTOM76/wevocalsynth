import type * as Video from '../../converter/src/video/index'
import { loadAddon } from '../addons/addons'
import type { Clip } from './types'

/**
 * 動画の書き出し。作るのは追加機能「変換」（converter/ の WeVocalConverter）が行う（memo/video-export.md）。
 * 使う前に導入を確かめる（useVideoExport の `ensure('converter')`）
 */
export type { VideoContainer, VideoLook, WaveStyle } from '../../converter/src/video/index'

let mod: typeof Video | null = null
const load = async () => (mod ??= await loadAddon<typeof Video>('converter'))

/** このブラウザでその入れ物の動画を作れるか */
export async function canEncodeVideo(container: Video.VideoContainer, width: number, height: number) {
  return (await load()).canEncodeVideo(container, width, height)
}

/** 音声に簡易な波形を付けて動画にする */
export async function renderVideo(clip: Clip, options: Video.VideoOptions) {
  return (await load()).renderVideo(clip, options)
}

export const VIDEO_MIME: Record<Video.VideoContainer, string> = { webm: 'video/webm', mp4: 'video/mp4' }
export const VIDEO_EXT: Record<Video.VideoContainer, string> = { webm: '.webm', mp4: '.mp4' }
