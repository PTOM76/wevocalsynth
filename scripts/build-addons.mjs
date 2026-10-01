// 追加機能を <出力先>/addons/ に作る。docs/EXTRACTOR.md
//   node scripts/build-addons.mjs          … dist（npm run build の後に実行する。CI はこちら）
//   node scripts/build-addons.mjs public   … public（npm run dev でも使える。npm run build でも dist にコピーされる）
// - vocal-extractor: ボーカル抽出の実行環境（extractor/ をビルド。ONNX Runtime Web を含む）
// - spleeter-<種類>: モデル。sherpa-onnx の配布物を取得し、vocals.onnx / accompaniment.onnx に名前をそろえる
// 各フォルダに manifest.json（ファイルの大きさとハッシュ、内容から決めたバージョン）を書く
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const OUT = `${process.argv[2] ?? 'dist'}/addons`
/** 取得したモデルの置き場所（git には入れない。CI ではキャッシュする） */
const CACHE = '.cache/addon-models'
const RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models'
/** モデルの種類 → 配布物の名前（接尾辞）とファイルの接尾辞 */
const MODELS = {
  fp16: { archive: '-fp16', file: 'fp16.onnx' },
  int8: { archive: '-int8', file: 'int8.onnx' },
  fp32: { archive: '', file: 'onnx' },
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

/** `dir` のファイル一式からマニフェストを書く。バージョンは内容のハッシュ（中身が変わったときだけ更新を知らせる） */
function writeManifest(id, dir, entry) {
  const files = listFiles(dir)
    .filter((p) => !p.endsWith('manifest.json'))
    .map((p) => {
      const data = readFileSync(p)
      return { path: relative(dir, p).replaceAll('\\', '/'), size: data.length, sha256: createHash('sha256').update(data).digest('hex') }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
  const version = createHash('sha256').update(files.map((f) => f.sha256).join()).digest('hex').slice(0, 12)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, version, entry, files }, null, 2))
  const mb = files.reduce((s, f) => s + f.size, 0) / 2 ** 20
  console.log(`addon ${id} v${version}: ${files.length} files, ${mb.toFixed(1)} MB`)
}

/** 再配布するときに付けるライセンスの全文（extractor/licenses/）を、追加機能のフォルダに入れる。LICENSE-THIRD-PARTY.md 参照 */
const addLicenses = (dir, names) => {
  mkdirSync(join(dir, 'licenses'), { recursive: true })
  for (const n of names) copyFileSync(join('extractor', 'licenses', n), join(dir, 'licenses', n))
}

// 実行環境
process.env.ADDONS_OUT = OUT
run('npx vite build -c vite.addons.config.ts')
addLicenses(join(OUT, 'vocal-extractor'), ['onnxruntime-MIT.txt'])
writeManifest('vocal-extractor', join(OUT, 'vocal-extractor'), 'index.js')

// モデル
mkdirSync(CACHE, { recursive: true })
for (const [kind, m] of Object.entries(MODELS)) {
  const src = join(CACHE, `sherpa-onnx-spleeter-2stems${m.archive}`)
  if (!existsSync(src)) run(`curl -sSfL ${RELEASE}/sherpa-onnx-spleeter-2stems${m.archive}.tar.bz2 | tar xj -C ${CACHE}`)
  const dir = join(OUT, `spleeter-${kind}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const stem of ['vocals', 'accompaniment']) copyFileSync(join(src, `${stem}.${m.file}`), join(dir, `${stem}.onnx`))
  addLicenses(dir, ['spleeter-MIT.txt', 'sherpa-onnx-Apache-2.0.txt'])
  writeManifest(`spleeter-${kind}`, dir, null)
}
