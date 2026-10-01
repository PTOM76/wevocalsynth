import { defineConfig } from 'vite'

// COI=1 で起動すると COOP/COEP ヘッダーを付け、WASM のマルチスレッドを試せる（GitHub Pages では付けられない）
const coi = process.env.COI === '1'

export default defineConfig({
  // スマホから試せるよう、同じネットワークの端末からも開けるようにする
  server: {
    host: true,
    headers: coi ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } : {},
  },
  // onnxruntime-web は自分で wasm を読み込むので、事前バンドルしない
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
