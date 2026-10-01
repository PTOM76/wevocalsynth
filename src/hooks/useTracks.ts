import { useMemo, useState } from 'react'
import type { Clip } from '../audio/types'
import { DEFAULT_FADER, DEFAULT_MIX, isAudible, makeTrack, type Track, type TrackFader, type TrackMix } from '../audio/tracks'
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
  // フェーダー（音量・パン）。再生と書き出しに常に掛ける
  const [faders, setFaders] = useState<Record<string, TrackFader>>({})
  const faderOf = (id: string) => faders[id] ?? DEFAULT_FADER
  // 大きな波形の後ろに重ねるトラック（見え方の切り替えなので履歴に入れない。既定は重ねない）
  const [overlay, setOverlay] = useState<ReadonlySet<string>>(new Set())
  const active = tracks.find((tr) => tr.id === activeId) ?? null

  /**
   * 選んでいるトラックと一緒に再生する、ほかのトラック。鳴らさないもの（ミュート・ソロ）も含めて渡し、
   * 再生中にミュート・ソロを切り替えたらすぐ反映できるようにする（`audible` で音量を 0 / 1 にする）
   */
  const others = useMemo(
    () => tracks.filter((tr) => tr.id !== activeId).map((tr) => ({ id: tr.id, clip: tr.clip, audible: isAudible(tr.id, mix, tracks) })),
    [tracks, activeId, mix],
  )
  /** 大きな波形の後ろに重ねる、ほかのトラックの音 */
  const ghosts = useMemo(() => tracks.filter((tr) => tr.id !== activeId && overlay.has(tr.id)).map((tr) => tr.clip), [tracks, activeId, overlay])
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

  /** トラック `ids` を消す（全部は消さない。1本は残す） */
  const removeMany = (ids: string[]) => {
    const rest = tracks.filter((tr) => !ids.includes(tr.id))
    if (!rest.length || rest.length === tracks.length) return
    // 選んでいるトラックを消したら、消したものの中で一番上の位置にある残りのトラックを選ぶ
    const i = tracks.findIndex((tr) => ids.includes(tr.id))
    const nextActive = ids.includes(activeId) ? rest[Math.min(i, rest.length - 1)].id : activeId
    history.setTracks(rest, nextActive, t('track.remove'))
  }
  /** トラックを消す（最後の1本は消さない） */
  const remove = (id: string) => removeMany([id])

  /** トラック `id` を `to` 番目に動かす（ドラッグでの並び替え。元に戻せる） */
  const move = (id: string, to: number) => {
    const from = tracks.findIndex((tr) => tr.id === id)
    if (from < 0 || from === to) return
    const list = tracks.filter((tr) => tr.id !== id)
    list.splice(Math.max(0, Math.min(list.length, to)), 0, tracks[from])
    history.setTracks(list, activeId, t('track.move'))
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
  /** 複数選んだトラックを統合する */
  const mergeMany = (ids: string[]) => merge(ids, t('track.mergeSelected'))

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
    removeMany,
    move,
    rename,
    mergeDown,
    mergeAll,
    mergeMany,
    /** `ids` のミュート・ソロをまとめて `on` にする */
    setMuteMany: (ids: string[], on: boolean) => ids.forEach((id) => setTrackMix(id, { mute: on })),
    setSoloMany: (ids: string[], on: boolean) => ids.forEach((id) => setTrackMix(id, { solo: on })),
    toggleMute: (id: string) => setTrackMix(id, { mute: !(mix[id]?.mute ?? false) }),
    toggleSolo: (id: string) => setTrackMix(id, { solo: !(mix[id]?.solo ?? false) }),
    overlay,
    ghosts,
    toggleOverlay: (id: string) =>
      setOverlay((s) => {
        const n = new Set(s)
        if (!n.delete(id)) n.add(id)
        return n
      }),
    faders,
    faderOf,
    setFader: (id: string, patch: Partial<TrackFader>) => setFaders((f) => ({ ...f, [id]: { ...(f[id] ?? DEFAULT_FADER), ...patch } })),
    /** ファイルを開き直したときに、フェーダー・鳴らし方・重ねる表示を `initial`（プロジェクトに保存した値）にする */
    resetMix: (initial: { faders?: Record<string, TrackFader>; mix?: Record<string, TrackMix>; overlay?: string[] } = {}) => {
      setMix(initial.mix ?? {})
      setOverlay(new Set(initial.overlay ?? []))
      setFaders(initial.faders ?? {})
    },
  }
}
