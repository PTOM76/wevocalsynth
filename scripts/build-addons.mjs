// 追加機能を <出力先>/addons/ に作る。docs/EXTRACTOR.md
//   node scripts/build-addons.mjs          … dist（npm run build の後に実行する。CI はこちら）
//   node scripts/build-addons.mjs public   … public（npm run dev でも使える。npm run build でも dist にコピーされる）
//   node scripts/build-addons.mjs public analyzer converter … 名前を並べると、その分だけ作る（extractor、analyzer、lyrics、converter、models。モデルの取得を避けたいときなど）
// - vocal-extractor: ボーカル抽出の実行環境（extractor/ をビルド）
// - vocal-extractor-gpu / -cpu: ONNX Runtime の wasm（WebGPU 対応版 / WASM 版。要る方だけ入れる）
// - spleeter-<種類>: モデル。sherpa-onnx の配布物を取得し、vocals.onnx / accompaniment.onnx に名前をそろえる
// - uvr-mdx-<種類>: UVR の MDX-Net のモデル（model.onnx）
// - demucs-4 / -6: Demucs のモデル（model.onnx を 90MB ずつに分けた model.onnx.000…）
// - analyzer: 解析（analyzer/ をビルド。今はスペクトログラム）
// - analyzer-lyrics: 歌詞の文字化（analyzer/ の src/lyrics.ts。transformers.js と ONNX Runtime）
// - whisper-<大きさ>: そのモデル。マニフェストだけを書き、ファイルは導入するときに Hugging Face から取る（analyzer/scripts/whisperAddons.mjs）
// - converter: 変換（converter/ をビルド。今は動画の書き出し）
// 各フォルダに manifest.json（ファイルの大きさとハッシュ、内容から決めたバージョン）を書く
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { writeWhisperManifests } from '../analyzer/scripts/whisperAddons.mjs'
import { buildModelAddons, buildRuntimeAddons, writeManifest } from '../extractor/scripts/addons.mjs'

const OUT = `${process.argv[2] ?? 'dist'}/addons`
/** 作るもの（省くと全部） */
const ONLY = process.argv.slice(3)
const want = (group) => !ONLY.length || ONLY.includes(group)
/** 取得したモデルの置き場所（git には入れない。CI ではキャッシュする） */
const CACHE = '.cache/addon-models'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

// 実行環境とモデルは extractor（WeVocal Studio と共通）
if (want('extractor')) buildRuntimeAddons(OUT)
if (want('models')) buildModelAddons(OUT, CACHE)

// 解析。モデルは使わない（wasm は analyzer/src/dsp.wasm をそのまま使う）
if (want('analyzer')) {
  run('npx vite build -c vite.addons.analyzer.config.ts')
  writeManifest('analyzer', join(OUT, 'analyzer'), 'index.js')
}

// 歌詞の文字化（analyzer/src/lyrics.ts。設定は Analyzer のものを使い、Analyzer と同じものを配る）
if (want('lyrics')) {
  run('npx vite build -c analyzer/vite.addons.lyrics.config.ts')
  writeManifest('analyzer-lyrics', join(OUT, 'analyzer-lyrics'), 'index.js')
  // モデル（マニフェストだけ。ファイルは Hugging Face から取得する）
  await writeWhisperManifests(OUT)
}

// 変換。今は動画の書き出しだけ（converter/src/video/）
if (want('converter')) {
  run('npx vite build -c vite.addons.converter.config.ts')
  writeManifest('converter', join(OUT, 'converter'), 'index.js')
}

