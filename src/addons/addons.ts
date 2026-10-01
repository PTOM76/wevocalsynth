import type { MessageKey } from '../i18n/i18n'

/**
 * 追加機能（アドオン）。使いたい人だけが導入し、導入後はオフラインでも使える（docs/EXTRACTOR.md）。
 * - 配信: `addons/<id>/manifest.json` とファイル一式（アプリと同じ場所）
 * - 保存先: アプリ本体とは別の Cache Storage（アプリの更新では消えない）
 * - 読み込み: Service Worker が保存先から返すので、普通に `import()` できる
 */

/** 保存先の名前。vite.config.ts の Service Worker の設定と一致させる */
export const ADDON_CACHE = 'wevocalsynth-addons'

export interface AddonFile {
  path: string
  /** 元の大きさ（バイト）。配信が gzip だと Content-Length は圧縮後になるので、進捗はこれで出す */
  size: number
  sha256: string
}

export interface AddonManifest {
  id: string
  version: string
  /** `import()` するファイル（モデルだけの追加機能は null） */
  entry: string | null
  files: AddonFile[]
}

export interface AddonInfo {
  id: string
  name: MessageKey
  /** 開発者向け（確認用。設定の「開発者向け」に出し、「読み込みを確認」ボタンを付ける） */
  dev?: boolean
  /** 先に導入が要る追加機能（導入するときに一緒に入れる） */
  requires?: string[]
}

/** 配信している追加機能 */
export const ADDONS: AddonInfo[] = [
  { id: 'vocal-extractor', name: 'addon.vocalExtractor' },
  { id: 'spleeter-fp16', name: 'addon.spleeterFp16', requires: ['vocal-extractor'] },
  { id: 'spleeter-int8', name: 'addon.spleeterInt8', requires: ['vocal-extractor'] },
  { id: 'spleeter-fp32', name: 'addon.spleeterFp32', requires: ['vocal-extractor'] },
  { id: 'test', name: 'addon.test', dev: true },
]

/** `id` と、その導入に要る追加機能（依存を先に並べる） */
export function withRequires(id: string): string[] {
  const info = ADDONS.find((a) => a.id === id)
  return [...new Set([...(info?.requires ?? []).flatMap(withRequires), id])]
}

/** この環境で使えるか（Cache Storage は https か localhost でしか使えない） */
export const addonsSupported = () => typeof caches !== 'undefined'

const baseUrl = (id: string) => new URL(`${import.meta.env.BASE_URL}addons/${id}/`, location.href)
const manifestUrl = (id: string) => new URL('manifest.json', baseUrl(id)).href

/** 追加機能の中のファイルの URL（導入済みなら Service Worker が保存先から返す） */
export const addonFileUrl = (id: string, path: string) => new URL(path, baseUrl(id)).href

export const addonSize = (m: AddonManifest) => m.files.reduce((s, f) => s + f.size, 0)

/** 配信中のマニフェスト（HTTP キャッシュを通さず取り直す） */
export async function fetchManifest(id: string): Promise<AddonManifest> {
  // 導入済みだと Service Worker が保存先のマニフェストを返すので、クエリを付けて別の URL にする
  const res = await fetch(`${manifestUrl(id)}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** 導入済みならそのマニフェスト、なければ null */
export async function installedManifest(id: string): Promise<AddonManifest | null> {
  if (!addonsSupported()) return null
  const res = await (await caches.open(ADDON_CACHE)).match(manifestUrl(id))
  return res ? res.json() : null
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** `res` を最後まで読む。読んだ分（展開後のバイト数）を `onBytes` に渡す */
async function readAll(res: Response, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  if (!res.body) return res.arrayBuffer()
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out.buffer
}

/**
 * `m` のファイルをすべて取得し、大きさとハッシュを確かめてから保存する。マニフェストは最後に保存する
 * （マニフェストがあれば導入済み、とみなすため）。途中で失敗・中断したら、その追加機能をすべて消す。
 * `onProgress` は 0〜1
 */
export async function install(m: AddonManifest, onProgress: (p: number) => void, signal?: AbortSignal) {
  const cache = await caches.open(ADDON_CACHE)
  const base = baseUrl(m.id)
  const total = addonSize(m) || 1
  let loaded = 0
  try {
    for (const f of m.files) {
      const url = new URL(f.path, base)
      // 導入済みの古い版が Service Worker から返らないよう、クエリを付けて保存先と別の URL にする
      const res = await fetch(`${url.href}?v=${encodeURIComponent(m.version)}`, { cache: 'no-store', signal })
      if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`)
      const buf = await readAll(res, (n) => onProgress(Math.min(1, (loaded += n) / total)))
      if (buf.byteLength !== f.size || (await sha256(buf)) !== f.sha256) throw new Error(`${f.path}: 内容が一致しません`)
      const type = res.headers.get('content-type') ?? 'application/octet-stream'
      await cache.put(url.href, new Response(buf, { headers: { 'content-type': type } }))
    }
    await cache.put(manifestUrl(m.id), new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } }))
    // 前の版にだけあったファイルを消す
    const keep = new Set([manifestUrl(m.id), ...m.files.map((f) => new URL(f.path, base).href)])
    for (const req of await cache.keys()) {
      if (req.url.startsWith(base.href) && !keep.has(req.url)) await cache.delete(req)
    }
  } catch (e) {
    await uninstall(m.id)
    throw e
  }
}

/** 追加機能のファイルをすべて消す */
export async function uninstall(id: string) {
  if (!addonsSupported()) return
  const cache = await caches.open(ADDON_CACHE)
  const base = baseUrl(id).href
  for (const req of await cache.keys()) {
    if (req.url.startsWith(base)) await cache.delete(req)
  }
}

/** 導入済みの追加機能を読み込む。モジュールの形は追加機能ごとに決める */
export async function loadAddon<T>(id: string): Promise<T> {
  const m = await installedManifest(id)
  if (!m?.entry) throw new Error(`${id} は導入されていないか、読み込むファイルがありません`)
  return import(/* @vite-ignore */ new URL(m.entry, baseUrl(id)).href)
}
