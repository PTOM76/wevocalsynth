import { useCallback, useEffect, useRef, useState } from 'react'
import { reportMemory } from '../debug/debugStats'
import type { Clip } from '../audio/types'
import type { Track } from '../audio/tracks'

/**
 * 1段ぶんの差分。今のクリップの [start, start + len) を `segment` に置き換えると、隣の段のクリップになる。
 * 範囲の加工では前後が変わらないので、クリップをまるごと持つより桁違いに小さい
 * （まるごと持つと 3分のステレオで1段約 65MB になり、20段でタブのメモリが 1GB を超えた）
 */
type Patch =
  | { kind: 'diff'; start: number; len: number; segment: Float32Array[] }
  /** チャンネル数・サンプルレートが変わったときは、まるごと持つ */
  | { kind: 'full'; clip: Clip }

const patchBytes = (p: Patch) =>
  (p.kind === 'diff' ? p.segment : p.clip.channels).reduce((s, c) => s + c.byteLength, 0)

/** `from` を `to` に変える差分と、逆に `to` を `from` に戻す差分を作る */
function diff(from: Clip, to: Clip): { forward: Patch; backward: Patch } {
  if (from.sampleRate !== to.sampleRate || from.channels.length !== to.channels.length) {
    return { forward: { kind: 'full', clip: to }, backward: { kind: 'full', clip: from } }
  }
  const a = from.channels
  const b = to.channels
  const la = a[0].length
  const lb = b[0].length
  // 先頭と末尾で全チャンネルが一致する長さ（チャンネルごとに求めて短い方を取る）
  let pre = Math.min(la, lb)
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    let n = 0
    while (n < pre && x[n] === y[n]) n++
    pre = n
  }
  let suf = Math.min(la, lb) - pre
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    let n = 0
    while (n < suf && x[la - 1 - n] === y[lb - 1 - n]) n++
    suf = n
  }
  return {
    forward: { kind: 'diff', start: pre, len: la - pre - suf, segment: b.map((c) => c.slice(pre, lb - suf)) },
    backward: { kind: 'diff', start: pre, len: lb - pre - suf, segment: a.map((c) => c.slice(pre, la - suf)) },
  }
}

/** `clip` に差分を当てたクリップ */
function applyPatch(clip: Clip, p: Patch): Clip {
  if (p.kind === 'full') return p.clip
  return {
    sampleRate: clip.sampleRate,
    channels: clip.channels.map((c, i) => {
      const seg = p.segment[i]
      const out = new Float32Array(c.length - p.len + seg.length)
      out.set(c.subarray(0, p.start))
      out.set(seg, p.start)
      out.set(c.subarray(p.start + p.len), p.start + seg.length)
      return out
    }),
  }
}

/**
 * 履歴の1段と、その段で行った操作の名前（一覧に出す）。
 * - patch: トラック `trackId` の音声の差分
 * - tracks: トラックの追加・削除。この段を当てると、トラックの一覧が `tracks` になる（音声は参照だけなので軽い）
 */
type Step = { label: string } & ({ kind: 'patch'; trackId: string; patch: Patch } | { kind: 'tracks'; tracks: Track[]; activeId: string })

const stepBytes = (s: Step) => (s.kind === 'patch' ? patchBytes(s.patch) : 0)

interface History {
  /** 元に戻す段（古い順）。最後の段を今の状態に当てると1つ前に戻る */
  past: Step[]
  tracks: Track[]
  /** 編集しているトラック（元に戻す・やり直すでは、変わったトラックに切り替える） */
  activeId: string
  /** やり直す段（次に進む順） */
  future: Step[]
}

const EMPTY: History = { past: [], tracks: [], activeId: '', future: [] }

/** `h` に段 `s` を当てた状態と、それを打ち消す段 */
function applyStep(h: History, s: Step): { tracks: Track[]; activeId: string; inverse: Step } | null {
  if (s.kind === 'tracks') {
    return { tracks: s.tracks, activeId: s.activeId, inverse: { kind: 'tracks', label: s.label, tracks: h.tracks, activeId: h.activeId } }
  }
  const track = h.tracks.find((t) => t.id === s.trackId)
  if (!track) return null
  const clip = applyPatch(track.clip, s.patch)
  return {
    tracks: h.tracks.map((t) => (t.id === s.trackId ? { ...t, clip } : t)),
    activeId: s.trackId,
    inverse: { kind: 'patch', label: s.label, trackId: s.trackId, patch: diff(clip, track.clip).forward },
  }
}

/** 1段戻す（戻せなければそのまま） */
function stepBack(h: History): History {
  const s = h.past[h.past.length - 1]
  const r = s && applyStep(h, s)
  if (!r) return h
  return { past: h.past.slice(0, -1), tracks: r.tracks, activeId: r.activeId, future: [r.inverse, ...h.future] }
}

/** 1段進む（進めなければそのまま） */
function stepForward(h: History, l: HistoryLimits): History {
  const s = h.future[0]
  const r = s && applyStep(h, s)
  if (!r) return h
  const future = h.future.slice(1)
  return { past: trim([...h.past, r.inverse], future, l), tracks: r.tracks, activeId: r.activeId, future }
}

/** 履歴の上限。limit は元に戻せる段数、udgetBytes は履歴が持つ音声データの量 */
export interface HistoryLimits {
  limit: number
  budgetBytes: number
}

/** 上限（段数・メモリ）に収まるよう、古い元に戻す段から捨てる */
function trim(past: Step[], future: Step[], l: HistoryLimits): Step[] {
  let bytes = [...past, ...future].reduce((s, p) => s + stepBytes(p), 0)
  let start = Math.max(0, past.length - l.limit)
  for (let i = 0; i < start; i++) bytes -= stepBytes(past[i])
  while (start < past.length && bytes > l.budgetBytes) bytes -= stepBytes(past[start++])
  return start ? past.slice(start) : past
}

/**
 * トラックと、その元に戻す / やり直すの履歴。各段は前後のクリップとの差分（またはトラックの一覧）だけを持つ。
 * 編集（commit）は選んでいるトラックに対して行う。トラックが1本なら今までの1クリップの履歴と同じ
 */
export function useHistory(limits: HistoryLimits) {
  // 上限は設定で変わるので、最新の値を更新処理の中から読む
  const limitsRef = useRef(limits)
  limitsRef.current = limits
  const [history, setHistory] = useState<History>(EMPTY)
  // デバッグ表示: 履歴が持っている音声データの量
  useEffect(() => reportMemory('history', [...history.past, ...history.future].reduce((s, p) => s + stepBytes(p), 0)), [history])

  /** 選んでいるトラックの新しいクリップを、操作の名前 `label` を付けて履歴に積む */
  const commit = useCallback((clip: Clip, label: string) => {
    setHistory((h) => {
      const track = h.tracks.find((t) => t.id === h.activeId)
      if (!track) return h
      const { backward } = diff(track.clip, clip)
      const step: Step = { kind: 'patch', label, trackId: track.id, patch: backward }
      return {
        ...h,
        past: trim([...h.past, step], [], limitsRef.current),
        tracks: h.tracks.map((t) => (t.id === track.id ? { ...t, clip } : t)),
        future: [],
      }
    })
  }, [])

  /** トラックの一覧を `tracks` に変える操作（追加・削除など）を履歴に積み、`activeId` を選ぶ */
  const setTracks = useCallback((tracks: Track[], activeId: string, label: string) => {
    setHistory((h) => {
      const step: Step = { kind: 'tracks', label, tracks: h.tracks, activeId: h.activeId }
      return { past: trim([...h.past, step], [], limitsRef.current), tracks, activeId, future: [] }
    })
  }, [])

  /** 履歴を捨てて `tracks` から始め直す（ファイルを開いたとき） */
  const reset = useCallback((tracks: Track[], activeId = tracks[0]?.id ?? '') => setHistory({ past: [], tracks, activeId, future: [] }), [])

  /** 編集するトラックを選ぶ（履歴には積まない） */
  const select = useCallback((id: string) => setHistory((h) => (h.tracks.some((t) => t.id === id) ? { ...h, activeId: id } : h)), [])

  const undo = useCallback(() => setHistory(stepBack), [])
  const redo = useCallback(() => setHistory((h) => stepForward(h, limitsRef.current)), [])

  /** 操作を `done` 個行った時点（0 なら開いた直後）へ、まとめて戻る・進む */
  const jumpTo = useCallback(
    (done: number) =>
      setHistory((h) => {
        let cur = h
        while (cur.past.length > done && cur.past.length > 0) cur = stepBack(cur)
        while (cur.past.length < done && cur.future.length > 0) cur = stepForward(cur, limitsRef.current)
        return cur
      }),
    [],
  )

  const active = history.tracks.find((t) => t.id === history.activeId) ?? null
  return {
    /** 選んでいるトラックの加工後・原音 */
    present: active?.clip ?? null,
    original: active?.original ?? null,
    tracks: history.tracks,
    activeId: history.activeId,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** 操作の名前の一覧（行った順）と、そのうち今までに行った数（残りはやり直せる操作） */
    labels: [...history.past, ...history.future].map((s) => s.label),
    done: history.past.length,
    jumpTo,
    commit,
    setTracks,
    select,
    reset,
    undo,
    redo,
  }
}
