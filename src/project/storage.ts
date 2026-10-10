// ブラウザ内に保存しているデータの確認と削除（設定の「データ」）
import { idbClear, idbPut } from './idb'
import { linkFolder, readMirroredWork } from './dataFolder'
import { restoreLocalSettings } from './settingsMirror'
import { ORIGINAL_PREFIX } from '../audio/originalStore'
import { ADDON_CACHE } from '../addons/addons'
import { app } from '../appConfig'
import { clearLocalItems, clearOfflineCache as clearCache } from 'pevenmui/web'

// 使用量、消されにくくする申請は PevenMUI（WeVocal Studio と共通）
export { storageUsage, isPersisted, requestPersist } from 'pevenmui/web'

/**
 * ブラウザ内に保存しているデータの確認と削除（設定の「データ」）。
 * - 作業データ: 自動保存した音声と作業状態（IndexedDB）
 * - オフライン用キャッシュ: PWA がオフラインで開けるように保存したアプリ本体（Cache Storage と Service Worker）
 * - 追加機能: 導入した追加機能のファイル（別の Cache Storage。設定の「ボーカル抽出」などで消す）
 * - 設定と画面の状態: localStorage の `wevocalsynth.` で始まる項目
 */

/** localStorage のうち、このアプリが使う項目の接頭辞 */
const LOCAL_PREFIX = app.key('')

/** 自動保存した作業データを消す */
// 開いている作業で退避中の原音は残す（消すと戻せなくなる。次の起動時の掃除で消える）
export const clearWorkData = () => idbClear(ORIGINAL_PREFIX)

/**
 * 指定したフォルダーに写した設定と作業を、ブラウザに戻す（PWA を入れ直したときなど）。何か戻したら true（そのあと再読み込みする）。
 * 作業は同じキーに書くので、今ブラウザにある自動保存は置き換わる
 */
export async function restoreFromFolder(): Promise<boolean> {
  const settings = await restoreLocalSettings()
  const work = await readMirroredWork()
  for (const [key, value] of work) await idbPut(key, value)
  // 戻したあとは、このブラウザから写し続ける
  await linkFolder()
  return settings || work.length > 0
}


/** オフライン用キャッシュを消し、Service Worker の登録を外す。追加機能は取り直しに時間がかかるので、`withAddons` のときだけ消す */
export const clearOfflineCache = (withAddons = false) => clearCache(withAddons ? [ADDON_CACHE] : [])

/** 設定と画面の状態（パネルの幅など）を消す */
export const clearLocalSettings = () => clearLocalItems(LOCAL_PREFIX)
