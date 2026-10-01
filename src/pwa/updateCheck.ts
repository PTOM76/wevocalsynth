/**
 * 新しい版の確認。Service Worker の登録（UpdatePrompt で行う）を覚えておき、
 * 設定画面の「今すぐ確認」からも確認できるようにする
 */

let registration: ServiceWorkerRegistration | null = null
/** 待っている新しい版に入れ替えて読み込み直す（UpdatePrompt が useRegisterSW から渡す） */
let applyUpdate: (() => void) | null = null

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

/** UpdatePrompt が、新しい版に入れ替える関数を渡す */
export function setApplyUpdate(fn: () => void) {
  applyUpdate = fn
}

/** 待っている新しい版に入れ替えて読み込み直す（設定の「更新」から呼ぶ） */
export function updateNow() {
  applyUpdate?.()
}

/** 確認の結果。found なら `build` に配信中の版（取れなければ null）を入れる */
export type UpdateCheckResult = { kind: 'found'; build: string | null } | { kind: 'latest' | 'unsupported' | 'failed' }

/** 今すぐ新しい版を確認する */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  // 開発サーバーや、Service Worker が使えないブラウザでは確認できない
  if (!registration) return { kind: 'unsupported' }
  try {
    await registration.update()
  } catch {
    return { kind: 'failed' }
  }
  if (!registration.installing && !registration.waiting) return { kind: 'latest' }
  // Service Worker が待っていても、配信中の版が今の版と同じなら最新（UpdatePrompt と同じ判定）
  const build = await fetchLatestBuild()
  return build === APP_BUILD ? { kind: 'latest' } : { kind: 'found', build }
}
