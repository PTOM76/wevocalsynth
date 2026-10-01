import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

/**
 * ビルドしたコミットの短いハッシュ。バージョン番号を上げずにデプロイしても、どの版か分かるようにする
 * （CI では GITHUB_SHA、手元では git から。取れなければ dev）
 */
function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}
const commit = commitHash()

/** OGP に使う配信先の絶対 URL（末尾 /）。CI から SITE_URL で指定する。無ければ公開中のドメイン */
const siteUrl = (process.env.SITE_URL ?? 'https://wevocalsynth.pitan76.net').replace(/\/?$/, '/')

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるため、CI から BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
  // UI 部品のライブラリ（サブモジュール）はソースのまま読み込む
  resolve: { alias: { pevenmui: fileURLToPath(new URL('./pevenmui/src/index.ts', import.meta.url)) } },
  // 「このアプリについて」に出すバージョン（package.json の version）とコミット
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
  plugins: [
    react(),
    // OGP のメタタグは絶対 URL が要るので、index.html の %SITE_URL% を置き換える
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
    // 更新の通知で「どの版が来たか」を出すため、配信中の版を version.json に書く
    // （オフライン用のキャッシュには入れない＝ globPatterns に json を含めないので、いつもサーバーの最新を読める）
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, commit }) })
      },
    },
    VitePWA({
      // 新しい版は利用者が「更新」を押したときに切り替える（作業中に勝手に再読み込みしない。UpdatePrompt 参照）
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WeVocalSynth',
        short_name: 'WeVocalSynth',
        lang: 'ja',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // workbox ランタイムを sw.js に埋め込み、ハッシュ付きファイルを出さない
        inlineWorkboxRuntime: true,
        // wasm もオフラインで使えるようにキャッシュ対象に含める
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // 追加機能はアプリ本体のプリキャッシュに入れず、導入した人だけ別のキャッシュに保存する（docs/EXTRACTOR.md）
        globIgnores: ['addons/**'],
        // 追加機能のページ（addons/ 以下）を開いたときにアプリ本体の index.html を返さない
        navigateFallbackDenylist: [/\/addons\//],
        runtimeCaching: [
          {
            // ページを開く操作は対象外（追加機能のファイルだけを保存先から返す）
            urlPattern: ({ url, request }) => url.pathname.includes('/addons/') && request.mode !== 'navigate',
            // 保存先にあればそれを返し、なければネットワークから取る。保存は導入の処理（src/addons/addons.ts）だけが行う
            // （CacheFirst だと取ったものを勝手に保存し、導入を中断したファイルや更新確認のマニフェストが残る）。
            // ignoreVary: サーバーが付ける Vary（Origin / Accept-Encoding）で照合が外れないようにする。
            // キャッシュ名は ADDON_CACHE と一致させる（sw.js に埋め込まれるので import できない）
            handler: async ({ request }) =>
              // @ts-expect-error この関数は sw.js（Service Worker）で動くので caches がある（設定ファイルの型は Node 向け）
              (await caches.match(request, { cacheName: 'wevocalsynth-addons', ignoreVary: true })) ?? fetch(request),
          },
        ],
      },
    }),
  ],
})
