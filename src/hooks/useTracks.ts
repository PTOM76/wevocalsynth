import { useMemo, useState } from 'react'
import type { Clip } from '../audio/types'
import { DEFAULT_MIX, isAudible, makeTrack, type Track, type TrackMix } from '../audio/tracks'
import { mixClips } from '../audio/mix'
import type { useHistory } from './useHistory'
import { t } from '../i18n/i18n'

/**
 * トラックの操作（複製・追加・削除・選択）と、鳴らし方（ミュート・ソロ）。
 * 一覧の変更は元に戻せる（useHistory の setTracks）。ミュート・ソロは聴き方の切り替えなので履歴に入れない
 */
export function useTracks(history: ReturnType<typeof useHistory>) {
  const { tracks, activeId } = history
  const [mix, setMix] = useState<Record<string, TrackMix>>({})
  const active = tracks.find((tr) => tr.id === activeId) ?? null

  /** 選んでいるトラックと一緒に鳴らす、ほかのトラックの音 */
  const others = useMemo(
    () => tracks.filter((tr) => tr.id !== activeId && isAudible(tr.id, mix, tracks)).map((tr) => tr.clip),
    [tracks, activeId, mix],
  )
  const activeMuted = !!active && !isAudible(active.id, mix, tracks)

  /** トラック `after`（既定は選んでいるもの）の直後に `added` を入れ、最初のものを選ぶ */
  const insertAfter = (added: Track[], label: string, after = activeId) => {
    const i = tracks.findIndex((tr) => tr.id === after)
    history.setTracks([...tracks.slice(0, i + 1), ...added, ...tracks.slice(i + 1)], added[0].id, label)
  }

  /** トラック `id`（既定は選んでいるもの）を複製する（複製してピッチを変えれば、そのままハモリになる） */
  const duplicate = (id = activeId) => {
    const src = tracks.find((tr) => tr.id === id)
    if (!src) return
    insertAfter([makeTrack(t('track.copyName', { name: src.name }), src.clip, src.original)], t('track.duplicate'), id)
  }

  /** 音声を新しいトラックとして足す（ファイルの追加） */
  const addClip = (clip: Clip, name: string) => insertAfter([makeTrack(name, clip)], t('track.add'))

  /**
   * トラック `id`（既定は選んでいるもの）を、`parts`（ボーカル・伴奏など）のトラックに置き換える。
   * 原音は元のトラックのものを引き継ぐ（「原音」と比べられるように）
   */
  const split = (parts: { name: string; clip: Clip }[], label: string, id = activeId) => {
    const src = tracks.find((tr) => tr.id === id)
    if (!src || !parts.length) return
    const i = tracks.indexOf(src)
    const made = parts.map((p) => makeTrack(p.name, p.clip, src.original))
    history.setTracks([...tracks.slice(0, i), ...made, ...tracks.slice(i + 1)], made[0].id, label)
  }

  /** トラックを消す（最後の1本は消さない） */
  const remove = (id: string) => {
    if (tracks.length <= 1) return
    const i = tracks.findIndex((tr) => tr.id === id)
    const rest = tracks.filter((tr) => tr.id !== id)
    const nextActive = id === activeId ? rest[Math.min(i, rest.length - 1)].id : activeId
    history.setTracks(rest, nextActive, t('track.remove'))
  }

  /** 名前を変える（元に戻せる） */
  const rename = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    history.setTracks(tracks.map((tr) => (tr.id === id ? { ...tr, name: trimmed } : tr)), activeId, t('track.rename'))
  }

  /**
   * `ids` のトラックを混ぜて1本にし、一番上のトラックの位置に置く（元に戻せる）。
   * サンプルレート・チャンネル数は一番上のトラックに合わせる。ミュート・ソロは無視して全部混ぜる
   */
  const merge = async (ids: string[], label: string) => {
    const parts = tracks.filter((tr) => ids.includes(tr.id))
    if (parts.length < 2) return
    const top = parts[0]
    const clip = await mixClips(parts.map((tr) => tr.clip), top.clip.sampleRate, Math.max(...parts.map((tr) => tr.clip.channels.length)))
    const merged = makeTrack(parts.map((tr) => tr.name).join(' + '), clip)
    const rest = tracks.filter((tr) => !ids.includes(tr.id) || tr === top)
    history.setTracks(rest.map((tr) => (tr === top ? merged : tr)), merged.id, label)
  }
  /** `id` のトラックを、すぐ下のトラックと統合する */
  const mergeDown = (id: string) => {
    const i = tracks.findIndex((tr) => tr.id === id)
    if (i < 0 || i + 1 >= tracks.length) return Promise.resolve()
    return merge([id, tracks[i + 1].id], t('track.mergeDown'))
  }
  const mergeAll = () => merge(tracks.map((tr) => tr.id), t('track.mergeAll'))

  const setTrackMix = (id: string, patch: Partial<TrackMix>) => setMix((m) => ({ ...m, [id]: { ...(m[id] ?? DEFAULT_MIX), ...patch } }))

  return {
    tracks,
    activeId,
    mix,
    others,
    activeMuted,
    select: history.select,
    duplicate,
    addClip,
    split,
    remove,
    rename,
    mergeDown,
    mergeAll,
    toggleMute: (id: string) => setTrackMix(id, { mute: !(mix[id]?.mute ?? false) }),
    toggleSolo: (id: string) => setTrackMix(id, { solo: !(mix[id]?.solo ?? false) }),
    /** ファイルを開き直したときに、鳴らし方を戻す */
    resetMix: () => setMix({}),
  }
}
