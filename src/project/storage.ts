// ブラウザ内に保存しているデータの確認と削除（設定の「データ」）
import { idbClear } from './idb'
import { ORIGINAL_PREFIX } from '../audio/originalStore'
import { ADDON_CACHE } from '../addons/addons'
import { app } from '../appConfig'

/**
 * ブラウザ内に保存しているデータの確認と削除（設定の「データ」）。
 * - 作業データ: 自動保存した音声と作業状態（IndexedDB）
 * - オフライン用キャッシュ: PWA がオフラインで開けるように保存したアプリ本体（Cache Storage と Service Worker）
 * - 追加機能: 導入した追加機能のファイル（別の Cache Storage。設定の「ボーカル抽出」などで消す）
 * - 設定と画面の状態: localStorage の `wevocalsynth.` で始まる項目
 */

/** localStorage のうち、このアプリが使う項目の接頭辞 */
const LOCAL_PREFIX = app.key('')

/** 使用量と上限（バイト）。ブラウザが対応していなければ null */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const e = await navigator.storage.estimate()
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
}

/** 自動保存した作業データを消す */
// 開いている作業で退避中の原音は残す（消すと戻せなくなる。次の起動時の掃除で消える）
export const clearWorkData = () => idbClear(ORIGINAL_PREFIX)

/**
 * オフライン用キャッシュを消し、Service Worker の登録を外す。
 * 次にページを開いたときに、アプリ本体をサーバーから取り直して登録し直す。
 * 追加機能は取り直しに時間がかかるので、`withAddons` のときだけ消す
 */
export async function clearOfflineCache(withAddons = false) {
  if ('caches' in window) {
    for (const key of await caches.keys()) if (withAddons || key !== ADDON_CACHE) await caches.delete(key)
  }
  if (navigator.serviceWorker) {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  }
}

/** 設定と画面の状態（パネルの幅など）を消す */
export function clearLocalSettings() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LOCAL_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // localStorage が使えない環境では、もともと何も保存されていない
  }
}

/** ブラウザが容量不足のときに自動で消さないようにする申請が通っているか（対応していなければ null） */
export async function isPersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null
  return navigator.storage.persisted()
}

/** 自動で消さないよう申請する。通ったかを返す（ブラウザが断ることもある） */
export async function requestPersist(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}
