// 原音を IndexedDB に退避してメモリを節約する
import { useEffect, useState } from 'react'
import type { Clip } from './types'
import { idbDelete, idbDeletePrefix, idbGet, idbPut } from '../project/idb'
import { otherWindowsOpen, slot } from '../project/windowSlot'

/**
 * 原音の退避（メモリの節約）。原音は聴き比べやテンポでの伸縮などでしか使わないので、加工したトラックの原音を IndexedDB に置き、
 * メモリ上の中身（`channels`）だけを空にする。Clip のオブジェクトはそのまま残すので、トラック・履歴・自動保存からの参照は変わらない。
 * 中身を使う前に `restoreClip` で戻す。退避中の Clip を画面や再生に渡さないこと（波形や解析は Clip ごとに覚えるので、空のまま残る）
 */

export const ORIGINAL_PREFIX = 'original:'
const PREFIX = ORIGINAL_PREFIX
/** 退避中の Clip と、置いたキー */
const offloaded = new WeakMap<Clip, string>()
/** 退避の途中（書き込み中）の Clip。途中で戻すように言われたら、退避をやめる */
const offloading = new WeakSet<Clip>()
/** 戻している途中の Clip（同時に何度呼ばれても、読み込みは1回にする） */
const restoring = new WeakMap<Clip, Promise<void>>()

/** 退避・復帰のたびに画面へ知らせる（中身を書き換えるだけで Clip は同じなので、React は変化に気づかない） */
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

/** 退避しているか（中身が空か） */
export const isOffloaded = (clip: Clip) => offloaded.has(clip)

/** `clip` の中身を IndexedDB に置き、メモリ上の中身を空にする。書き込みに失敗したら何もしない */
export async function offloadClip(clip: Clip) {
  if (offloaded.has(clip) || offloading.has(clip) || !clip.channels[0]?.length) return
  offloading.add(clip)
  const key = `${slotPrefix()}${crypto.randomUUID()}`
  try {
    await idbPut(key, clip.channels)
  } catch {
    offloading.delete(clip)
    return
  }
  // 書いている間に戻すように言われた（使うことになった）ら、やめる
  if (!offloading.has(clip)) {
    void idbDelete(key).catch(() => {})
    return
  }
  offloading.delete(clip)
  offloaded.set(clip, key)
  // 元の配列は、ほかに持っているもの（自動保存の送り待ちなど）がなくなれば解放される
  clip.channels = clip.channels.map(() => new Float32Array(0))
  notify()
}

/** 退避した中身を戻す（退避していなければ何もしない）。読めなければ例外 */
export function restoreClip(clip: Clip): Promise<void> {
  offloading.delete(clip)
  const key = offloaded.get(clip)
  if (!key) return Promise.resolve()
  let p = restoring.get(clip)
  if (!p) {
    p = (async () => {
      const channels = (await idbGet(key)) as Float32Array[] | undefined
      if (!channels?.length) throw new Error('original audio not found')
      clip.channels = channels
      offloaded.delete(clip)
      void idbDelete(key).catch(() => {})
      notify()
    })().finally(() => restoring.delete(clip))
    restoring.set(clip, p)
  }
  return p
}

/** このウィンドウが退避に使うキーの接頭辞（ほかのウィンドウの退避を消さないよう、枠ごとに分ける。windowSlot.ts） */
const slotPrefix = () => `${PREFIX}${slot === null ? 'x' : `w${slot}`}:`

/**
 * 起動時に、前回の退避の残り（閉じたときに置いたままのもの）を消す（枠を取った後に呼ぶ）。
 * ほかのウィンドウがなければすべて、あれば自分の枠の分だけ。枠なしのウィンドウは消さない（ほかの枠なしのものと見分けられない）
 */
export async function clearOffloaded() {
  if (slot === null) return
  const prefix = (await otherWindowsOpen().catch(() => true)) ? slotPrefix() : PREFIX
  await idbDeletePrefix(prefix).catch(() => {})
}

/** 退避・復帰で描き直す（数を返すので、依存の配列に入れて使う） */
export function useOffloadVersion() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const f = () => setVersion((v) => v + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  return version
}
