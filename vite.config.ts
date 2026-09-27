import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるため、CI から BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WeVocalSynth',
        short_name: 'WeVocalSynth',
        lang: 'ja',
        display: 'standalone',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // wasm もオフラインで使えるようにキャッシュ対象に含める
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
})
