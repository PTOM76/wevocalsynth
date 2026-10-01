/**
 * 新しい版の確認。Service Worker の登録（UpdatePrompt で行う）を覚えておき、
 * 設定画面の「今すぐ確認」からも確認できるようにする
 */

let registration: ServiceWorkerRegistration | null = null

/** 今動いている版（バージョンとコミット。例: 1.0.3 (47a7e39)） */
export const APP_BUILD = `${__APP_VERSION__} (${__APP_COMMIT__})`

/**
 * 配信中の版（ビルド時に書いた version.json）。更新の通知で「どの版が来たか」を出すのに使う。
 * 取れなければ null（オフラインなど）
 */
export async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    if (!res.ok) return null
    const v = (await res.json()) as { version: string; commit: string }
    return `${v.version} (${v.commit})`
  } catch {
    return null
  }
}

/** UpdatePrompt が Service Worker を登録したときに呼ぶ */
export function setRegistration(r: ServiceWorkerRegistration) {
  registration = r
}

/** 確認の結果。found なら UpdatePrompt が「新しいバージョンがあります」を出す */
export type UpdateCheckResult = 'found' | 'latest' | 'unsupported' | 'failed'

/** 今すぐ新しい版を確認する */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  // 開発サーバーや、Service Worker が使えないブラウザでは確認できない
  if (!registration) return 'unsupported'
  try {
    await registration.update()
  } catch {
    return 'failed'
  }
  return registration.installing || registration.waiting ? 'found' : 'latest'
}
