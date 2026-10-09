// ウィンドウごとの枠（複数のウィンドウで、自動保存などの保存先を分ける）
import { app } from '../appConfig'

/**
 * 複数のウィンドウを開いたときに、自動保存・退避した原音・抽出の予約が互いに上書きしないよう、ウィンドウごとに番号（枠）を持つ。
 * - 起動時に Web Locks で空いている一番小さい番号を取り、閉じるまで持つ（閉じたり落ちたりすればブラウザが外す）
 * - 枠 0 は以前と同じキーを使う（保存済みのデータをそのまま読む）。枠 1 以降はキーに `s1:` などを付ける
 * - 再読み込みでは同じ枠を取り直す（sessionStorage に覚える。メモリが足りないときの抽出は再読み込みをはさむ）
 * - 枠が埋まっていれば `slot` は null（設定で許していれば、自動保存しないウィンドウとして開く）
 * - Web Locks がない環境では、以前と同じく枠 0 として動く（ほかのウィンドウを調べられない）
 */
const LOCK_PREFIX = app.key('slot.')
const SESSION_KEY = app.key('slot')

/** このウィンドウの枠。null は枠なし（上限を超えて開いた） */
export let slot: number | null = 0

const locks = () => (typeof navigator !== 'undefined' ? navigator.locks : undefined)

/** `name` のロックを取れたら、閉じるまで持つ */
const tryHold = (name: string) =>
  new Promise<boolean>((resolve) => {
    locks()!
      .request(name, { ifAvailable: true }, (lock) => {
        resolve(!!lock)
        // 持ち続ける（ウィンドウを閉じればブラウザが外す）
        return lock ? new Promise<void>(() => {}) : undefined
      })
      .catch(() => resolve(false))
  })

/** 起動時に枠を取る（main.tsx で描画の前に 1 回）。`max` は枠の数 */
export async function acquireSlot(max: number): Promise<number | null> {
  if (!locks()) return (slot = 0)
  let preferred = -1
  try {
    preferred = Number(sessionStorage.getItem(SESSION_KEY) ?? -1)
  } catch {
    // 覚えられなければ、空いている枠を取るだけ
  }
  const order = [...(preferred >= 0 && preferred < max ? [preferred] : []), ...Array.from({ length: max }, (_, i) => i).filter((i) => i !== preferred)]
  slot = null
  for (const i of order) {
    if (await tryHold(`${LOCK_PREFIX}${i}`)) {
      slot = i
      break
    }
  }
  try {
    if (slot !== null) sessionStorage.setItem(SESSION_KEY, String(slot))
  } catch {
    // 何もしない
  }
  return slot
}

/** ほかのウィンドウが開いているか（ほかの枠のロックがあるか） */
export async function otherWindowsOpen(): Promise<boolean> {
  const l = locks()
  if (!l) return false
  const { held = [] } = await l.query()
  return held.some((h) => h.name?.startsWith(LOCK_PREFIX) && h.name !== `${LOCK_PREFIX}${slot}`)
}

/** 開いているウィンドウの数（枠を持っているもの） */
export async function openWindowCount(): Promise<number> {
  const l = locks()
  if (!l) return 1
  const { held = [] } = await l.query()
  return new Set(held.filter((h) => h.name?.startsWith(LOCK_PREFIX)).map((h) => h.name)).size
}

/** 枠の印（枠 0 は ''、枠 1 以降は 's1' など、枠なしは 'x'） */
export const slotTag = () => (slot === 0 ? '' : slot === null ? 'x' : `s${slot}`)

/** このウィンドウの保存先のキー。枠 0 は `key` のまま、枠 1 以降は `key@s1` など（枠を取った後に呼ぶ） */
export const slotKey = (key: string) => (slot === 0 ? key : `${key}@${slotTag()}`)

/** 新しいウィンドウを開く（インストールした PWA ではアプリのウィンドウになる）。sessionStorage を写さないよう noopener にする */
export const openNewWindow = () => void window.open(location.origin + location.pathname, '_blank', 'noopener')
