import { isFlatEq, parseEq, type TrackEq } from './eq'
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

/** トラックの鳴らし方。元に戻す履歴には入れない（聴き方の切り替えなので）が、プロジェクトファイルと自動保存には保存する */
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
  /** 位相（極性）を反転する（波形の上下を逆にする。ほかのトラックとの打ち消し合いを直す・確かめるとき） */
  invert?: boolean
}

export const DEFAULT_FADER: TrackFader = { db: 0, pan: 0 }

export const isNeutralFader = (f: TrackFader) => f.db === 0 && f.pan === 0 && !f.invert

/** フェーダーの音量の倍率（位相の反転は負の倍率として掛ける） */
export const faderGain = (f: TrackFader) => 10 ** (f.db / 20) * (f.invert ? -1 : 1)

/**
 * トラックごとの、音声以外の状態（フェーダー・鳴らし方・重ねる表示）。プロジェクトファイルと自動保存に保存する。
 * 項目を足すときは、ここと `StoredTrackSettings`・`toStoredSettings`・`fromStoredSettings` だけを直す
 * （保存・読み込み・開き直したときの復元は、どれもこの変換を通す）
 */
export interface TrackSettings {
  fader: TrackFader
  eq: TrackEq
  mix: TrackMix
  /** 大きな波形の後ろに重ねて表示する */
  overlay: boolean
}

/**
 * ファイルに書く形。古いファイルと同じく項目を平らに並べ、どれも省略できる（無ければ既定値）。
 * 名前は保存済みのファイルと互換なので変えない
 */
export interface StoredTrackSettings {
  volume?: number
  pan?: number
  invert?: boolean
  eq?: TrackEq
  mute?: boolean
  solo?: boolean
  overlay?: boolean
}

/** `StoredTrackSettings` の項目名（保存したものから、この項目だけを取り出すのに使う） */
const STORED_KEYS = ['volume', 'pan', 'invert', 'eq', 'mute', 'solo', 'overlay'] as const satisfies readonly (keyof StoredTrackSettings)[]

export function toStoredSettings(s: TrackSettings): StoredTrackSettings {
  return { volume: s.fader.db, pan: s.fader.pan, invert: s.fader.invert, eq: isFlatEq(s.eq) && s.eq.on && s.eq.bands === 10 ? undefined : s.eq, mute: s.mix.mute, solo: s.mix.solo, overlay: s.overlay }
}

export function fromStoredSettings(s: StoredTrackSettings | undefined): TrackSettings {
  return {
    fader: { db: s?.volume ?? 0, pan: s?.pan ?? 0, invert: !!s?.invert },
    eq: parseEq(s?.eq),
    mix: { mute: !!s?.mute, solo: !!s?.solo },
    overlay: !!s?.overlay,
  }
}

/** 保存したもの（ヘッダなど、ほかの項目も入っている）から、トラックの設定の項目だけを取り出す */
export function pickStoredSettings(s: StoredTrackSettings | undefined): StoredTrackSettings {
  return Object.fromEntries(STORED_KEYS.map((k) => [k, s?.[k]])) as StoredTrackSettings
}

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
