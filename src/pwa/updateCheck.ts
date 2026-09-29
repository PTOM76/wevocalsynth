/**
 * 新しい版の確認。Service Worker の登録（UpdatePrompt で行う）を覚えておき、
 * 設定画面の「今すぐ確認」からも確認できるようにする
 */

let registration: ServiceWorkerRegistration | null = null

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
