import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { APP_INFO } from './src/appInfo.ts'
import { pevenApp, pevenManifest } from './pevenmui/src/vite.ts'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるため、CI から BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
  // UI 部品のライブラリ（サブモジュール）はソースのまま読み込む
  resolve: {
    // サブモジュール（converter など）の node_modules の React を読むと 2 つ混ざって動かないので、Synth のものにそろえる
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material'],
    alias: [
      { find: /^pevenmui$/, replacement: fileURLToPath(new URL('./pevenmui/src/index.ts', import.meta.url)) },
      { find: /^pevenmui\/pwa$/, replacement: fileURLToPath(new URL('./pevenmui/src/pwa/index.ts', import.meta.url)) },
      { find: /^pevenmui\/web$/, replacement: fileURLToPath(new URL('./pevenmui/src/web/index.ts', import.meta.url)) },
      // 音声ファイルの読み込み・書き出し（wevocal-lib の TypeScript 側）
      { find: /^wevocal-lib\/react$/, replacement: fileURLToPath(new URL('./wevocal-lib/web/src/react/index.ts', import.meta.url)) },
      { find: /^wevocal-lib$/, replacement: fileURLToPath(new URL('./wevocal-lib/web/src/index.ts', import.meta.url)) },
    ],
  },
  plugins: [
    react(),
    // 版（__APP_VERSION__、__APP_COMMIT__、version.json）と、index.html の名前、言語、配信先の URL（SITE_URL で指定）。
    // version.json はオフライン用のキャッシュには入れない（globPatterns に json を含めない）ので、いつもサーバーの最新を読める
    pevenApp(APP_INFO, { version: pkg.version }),
    VitePWA({
      // 新しい版は利用者が「更新」を押したときに切り替える（作業中に勝手に再読み込みしない。UpdatePrompt 参照）
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        ...pevenManifest(APP_INFO),
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
        // インストールした PWA を、プロジェクトファイル（.wvsp）を開くアプリとして OS に登録する（File Handling API。Chrome、Edge のデスクトップ版）。
        // 音声ファイル（.mp3 など）は登録しない。ブラウザの確認画面の「次のファイル形式の設定を保存」が登録した形式すべてに効き、
        // 普段の音声ファイルまでこのアプリで開くようになってしまうため。ダブルクリックで起動したファイルは launchQueue で受け取る（src/hooks/useEditor.ts）
        file_handlers: [
          {
            action: './',
            accept: { 'application/x-wevocalsynth-project': ['.wvsp'] },
          },
        ],
        // 複数のファイルを開いたときも、窓は1つで受け取る
        launch_handler: { client_mode: 'focus-existing' },
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
            // 保存先になければ、選んだフォルダー（試験的。src/addons/addonFolder.ts、memo/addon-folder.md）から返す。
            // この関数は sw.js に埋め込まれるので、外の関数や定数を使わずに書く
            handler: async ({ request, url }) => {
              // @ts-expect-error この関数は sw.js（Service Worker）で動くので caches がある（設定ファイルの型は Node 向け）
              const hit = await caches.match(request, { cacheName: 'wevocalsynth-addons', ignoreVary: true })
              if (hit) return hit
              // 導入の取得（?v=）や更新の確認（?t=）はネットワークから取る
              if (!url.search) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const g = globalThis as any
                  // アプリの IndexedDB（pevenmui の createIdb と同じ形。まだなければ同じく kv を作る）
                  const dir = await new Promise<any>((resolve) => {
                    const open = g.indexedDB.open('wevocalsynth', 1)
                    open.onupgradeneeded = () => open.result.createObjectStore('kv')
                    open.onerror = () => resolve(null)
                    open.onsuccess = () => {
                      const req = open.result.transaction('kv').objectStore('kv').get('addonFolder')
                      req.onsuccess = () => (resolve(req.result), open.result.close())
                      req.onerror = () => (resolve(null), open.result.close())
                    }
                  })
                  if (dir && (await dir.queryPermission({ mode: 'readwrite' })) === 'granted') {
                    const rel = decodeURIComponent(url.pathname.slice(new URL(g.registration.scope).pathname.length + 'addons/'.length))
                    const parts = rel.split('/')
                    let h = await dir.getDirectoryHandle('wevocalsynth-addons')
                    for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p)
                    const file = await (await h.getFileHandle(parts[parts.length - 1])).getFile()
                    const ext = rel.slice(rel.lastIndexOf('.') + 1)
                    const types: Record<string, string> = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', json: 'application/json' }
                    return new Response(file, { headers: { 'content-type': types[ext] ?? 'application/octet-stream' } })
                  }
                } catch {
                  // フォルダーになければネットワークから
                }
              }
              return fetch(request)
            },
          },
        ],
      },
    }),
  ],
})
