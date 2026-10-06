import type { VideoContainer, WaveStyle } from '../audio/video'

/** 動画の書き出しで選んだもの（設定に覚える。背景の画像は覚えない） */
export interface VideoExportPrefs {
  container: VideoContainer
  /** 幅x高さ */
  size: '1280x720' | '1920x1080' | '1080x1920' | '1080x1080'
  style: WaveStyle
  position: 'bottom' | 'center'
  /** 背景、波形、再生したところの色 */
  bg: string
  wave: string
  played: string
  /** 背景の画像の合わせ方 */
  fit: 'cover' | 'contain'
  /** ファイル名を曲名として入れる */
  title: boolean
  /** 音量波形をグラデーションにする */
  gradient: boolean
  /** 音量波形の棒の数（細かさ） */
  bars: 32 | 64 | 128
}

export const DEFAULT_VIDEO_PREFS: VideoExportPrefs = {
  container: 'mp4',
  size: '1280x720',
  style: 'bars',
  position: 'center',
  bg: '#101418',
  wave: '#5c6b7a',
  played: '#4fc3f7',
  fit: 'cover',
  title: false,
  gradient: false,
  bars: 64,
}
