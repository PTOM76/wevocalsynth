import { useCallback, useEffect, useRef, useState } from 'react'
import { reportMemory } from '../debug/debugStats'
import type { Clip } from '../audio/types'


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

/** 履歴の1段: 差分と、その段で行った操作の名前（一覧に出す） */
interface Step {
  patch: Patch
  label: string
}

interface History {
  /** 元に戻す段（古い順）。最後の差分を今のクリップに当てると1つ前に戻る */
  past: Step[]
  present: Clip | null
  /** やり直す段（次に進む順） */
  future: Step[]
}

/** 1段戻す（戻せなければそのまま） */
function stepBack(h: History): History {
  const s = h.past[h.past.length - 1]
  if (!s || !h.present) return h
  const prev = applyPatch(h.present, s.patch)
  return { past: h.past.slice(0, -1), present: prev, future: [{ patch: diff(prev, h.present).forward, label: s.label }, ...h.future] }
}

/** 1段進む（進めなければそのまま） */
function stepForward(h: History, l: HistoryLimits): History {
  const s = h.future[0]
  if (!s || !h.present) return h
  const next = applyPatch(h.present, s.patch)
  const future = h.future.slice(1)
  return { past: trim([...h.past, { patch: diff(next, h.present).forward, label: s.label }], future, l), present: next, future }
}

/** 履歴の上限。limit は元に戻せる段数、udgetBytes は履歴が持つ音声データの量 */
export interface HistoryLimits {
  limit: number
  budgetBytes: number
}

/** 上限（段数・メモリ）に収まるよう、古い元に戻す差分から捨てる */
function trim(past: Step[], future: Step[], l: HistoryLimits): Step[] {
  let bytes = [...past, ...future].reduce((s, p) => s + patchBytes(p.patch), 0)
  let start = Math.max(0, past.length - l.limit)
  for (let i = 0; i < start; i++) bytes -= patchBytes(past[i].patch)
  while (start < past.length && bytes > l.budgetBytes) bytes -= patchBytes(past[start++].patch)
  return start ? past.slice(start) : past
}

/** 編集中クリップの履歴（元に戻す / やり直す）。各段は前後のクリップとの差分だけを持つ */
export function useHistory(limits: HistoryLimits) {
  // 上限は設定で変わるので、最新の値を更新処理の中から読む
  const limitsRef = useRef(limits)
  limitsRef.current = limits
  const [history, setHistory] = useState<History>({ past: [], present: null, future: [] })
  // デバッグ表示: 履歴が持っている音声データの量
  useEffect(() => reportMemory('history', [...history.past, ...history.future].reduce((s, p) => s + patchBytes(p.patch), 0)), [history])

  /** 新しいクリップを、操作の名前 `label` を付けて履歴に積む */
  const commit = useCallback((clip: Clip, label: string) => {
    setHistory((h) => {
      if (!h.present) return { past: [], present: clip, future: [] }
      const { backward } = diff(h.present, clip)
      return { past: trim([...h.past, { patch: backward, label }], [], limitsRef.current), present: clip, future: [] }
    })
  }, [])

  /** 履歴を捨てて `clip` から始め直す（ファイルを開いたとき） */
  const reset = useCallback((clip: Clip) => setHistory({ past: [], present: clip, future: [] }), [])

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

  return {
    present: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** 操作の名前の一覧（行った順）と、そのうち今までに行った数（残りはやり直せる操作） */
    labels: [...history.past, ...history.future].map((s) => s.label),
    done: history.past.length,
    jumpTo,
    commit,
    reset,
    undo,
    redo,
  }
}
