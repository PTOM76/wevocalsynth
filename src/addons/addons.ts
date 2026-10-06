import type { MessageKey } from '../i18n/i18n'
import { app } from '../appConfig'

/**
 * 追加機能（アドオン）。使いたい人だけが導入し、導入後はオフラインでも使える（docs/EXTRACTOR.md）。
 * - 配信: `addons/<id>/manifest.json` とファイル一式（アプリと同じ場所）
 * - 保存先: アプリ本体とは別の Cache Storage（アプリの更新では消えない）
 * - 読み込み: Service Worker が保存先から返すので、普通に `import()` できる
 */

/** 保存先の名前。vite.config.ts の Service Worker の設定と一致させる */
export const ADDON_CACHE = app.cacheName('addons')

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
  /** 設定の一覧に出す短い名前（その機能の設定画面に並べるので、機能名を繰り返さない） */
  shortName?: MessageKey
  /** 先に導入が要る追加機能（導入するときに一緒に入れる） */
  requires?: string[]
  /** ほかの追加機能を使うときに一緒に入れるもの（設定の一覧には出さない。使うものがなくなったら一緒に消す） */
  companion?: boolean
}

/** 配信している追加機能 */
export const ADDONS: AddonInfo[] = [
  { id: 'vocal-extractor', name: 'addon.vocalExtractor' },
  // ONNX Runtime の wasm。WebGPU で動かすなら gpu、CPU なら cpu を入れる（src/audio/vocalExtract.ts）
  { id: 'vocal-extractor-gpu', name: 'addon.runtimeGpu', requires: ['vocal-extractor'], companion: true },
  { id: 'vocal-extractor-cpu', name: 'addon.runtimeCpu', requires: ['vocal-extractor'], companion: true },
  { id: 'spleeter-fp16', name: 'addon.spleeterFp16', shortName: 'addon.modelLight', requires: ['vocal-extractor'] },
  { id: 'spleeter-int8', name: 'addon.spleeterInt8', shortName: 'addon.modelStandard', requires: ['vocal-extractor'] },
  { id: 'spleeter-fp32', name: 'addon.spleeterFp32', shortName: 'addon.modelPrecise', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-voc-ft', name: 'addon.uvrVocFt', shortName: 'addon.modelVocalHq', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-inst-hq4', name: 'addon.uvrInstHq4', shortName: 'addon.modelInstHq', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-kara2', name: 'addon.uvrKara2', shortName: 'addon.modelLead', requires: ['vocal-extractor'] },
  // 解析（analyzer/ の WeVocalAnalyzer）。今はスペクトログラムの表示に使う（src/audio/spectrogram.ts）
  { id: 'analyzer', name: 'addon.analyzer' },
  // 変換（converter/ の WeVocalConverter）。今は動画の書き出しに使う（src/audio/video.ts）
  { id: 'converter', name: 'addon.converter' },
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

/**
 * `id` を消し、それが依存していた追加機能のうち、ほかの導入済みの追加機能から使われなくなったものも消す
 * （例: モデルを全部消したら実行環境も消す）
 */
export async function uninstallWithUnused(id: string) {
  await uninstall(id)
  const installed = new Set<string>()
  for (const a of ADDONS) if (await installedManifest(a.id)) installed.add(a.id)
  for (const dep of withRequires(id).filter((d) => d !== id)) {
    // 一緒に入れるもの（companion）以外に、使っているものがなければ消す。そのとき一緒に入れたものも消す
    const used = ADDONS.some((a) => installed.has(a.id) && a.id !== dep && !a.companion && withRequires(a.id).includes(dep))
    if (used) continue
    for (const c of ADDONS.filter((a) => a.companion && withRequires(a.id).includes(dep))) await uninstall(c.id)
    await uninstall(dep)
  }
}

/** 導入済みの追加機能の合計の大きさ（バイト） */
export async function installedAddonsSize(): Promise<number> {
  let total = 0
  for (const a of ADDONS) {
    const m = await installedManifest(a.id)
    if (m) total += addonSize(m)
  }
  return total
}

/** 導入済みの追加機能をすべて消す（設定の「データ」） */
export async function clearAddons() {
  if (addonsSupported()) await caches.delete(ADDON_CACHE)
}

/** 導入済みの追加機能を読み込む。モジュールの形は追加機能ごとに決める */
export async function loadAddon<T>(id: string): Promise<T> {
  const m = await installedManifest(id)
  if (!m?.entry) throw new Error(`${id} は導入されていないか、読み込むファイルがありません`)
  return import(/* @vite-ignore */ new URL(m.entry, baseUrl(id)).href)
}
