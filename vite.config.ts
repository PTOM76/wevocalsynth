import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { APP_INFO } from './src/appInfo.ts'
import { pevenAddonsRoute, pevenApp, pevenManifest } from './pevenmui/src/vite.ts'

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
        // 更新で切り替わったときに、名前の違う古い版のキャッシュを消す
        cleanupOutdatedCaches: true,
        // wasm もオフラインで使えるようにキャッシュ対象に含める。フォントは woff2 だけ（woff は woff2 に対応しないブラウザ用で、読まれない）
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // 追加機能はアプリ本体のプリキャッシュに入れず、導入した人だけ別のキャッシュに保存する（docs/EXTRACTOR.md）
        globIgnores: ['addons/**'],
        // 追加機能のページ（addons/ 以下）を開いたときにアプリ本体の index.html を返さない
        navigateFallbackDenylist: [/\/addons\//],
        // 追加機能のファイルを保存先から返す（保存先の名前は app.id から決まる。pevenmui/src/addons/store.ts）
        runtimeCaching: [pevenAddonsRoute(APP_INFO.id)],
      },
    }),
  ],
})
