import type { Clip } from './types'

/**
 * トラック。編集できるのは選んでいるトラックだけで、ほかのトラックは一緒に鳴らして聴く参照になる。
 * 音声は書き換えず、編集のたびに新しい Clip を作る（元に戻す履歴は差分で持つ。useHistory）
 */
export interface Track {
  id: string
  name: string
  /** 原音（「原音」との比較に使う） */
  original: Clip
  /** 加工後 */
  clip: Clip
}

/** トラックの鳴らし方。元に戻す履歴には入れない（聴き方の切り替えなので） */
export interface TrackMix {
  mute: boolean
  solo: boolean
}

export const DEFAULT_MIX: TrackMix = { mute: false, solo: false }

/**
 * トラックの音量・パン（フェーダー）。音声は書き換えず、再生と書き出しの両方に常に掛ける（適用ボタンは無い）。
 * 元に戻す履歴には入れないが、プロジェクトファイルと自動保存には保存する
 */
export interface TrackFader {
  /** 音量（dB） */
  db: number
  /** パン（-1 = 左 … 0 = 中央 … 1 = 右） */
  pan: number
}

export const DEFAULT_FADER: TrackFader = { db: 0, pan: 0 }

export const isNeutralFader = (f: TrackFader) => f.db === 0 && f.pan === 0

let nextId = 1
export const newTrackId = () => `t${Date.now().toString(36)}${(nextId++).toString(36)}`

export function makeTrack(name: string, clip: Clip, original: Clip = clip): Track {
  return { id: newTrackId(), name, original, clip }
}

/** ミュート・ソロに従って、鳴らすか（ソロのトラックが1つでもあれば、ソロのものだけ鳴らす） */
export function isAudible(id: string, mix: Record<string, TrackMix>, tracks: Track[]) {
  const anySolo = tracks.some((t) => mix[t.id]?.solo)
  const m = mix[id] ?? DEFAULT_MIX
  return anySolo ? m.solo : !m.mute
}
