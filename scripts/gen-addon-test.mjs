// 確認用の追加機能「test」を <出力先>/addons/test/ に作る（既定は dist。ビルド後に実行する）
// 中身は数十MBのダミーファイルと、読み込みを確かめる index.js。追加機能の仕組みを確かめるためのもの
//   node scripts/gen-addon-test.mjs          … 本番ビルド（dist）に加える
//   node scripts/gen-addon-test.mjs public   … 開発サーバー（npm run dev）で試す
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const SIZE_MB = Number(process.env.ADDON_TEST_MB ?? 40)
const dir = `${process.argv[2] ?? 'dist'}/addons/test`
mkdirSync(dir, { recursive: true })

const version = new Date().toISOString().slice(0, 19).replace(/\D/g, '')
const files = {
  'index.js': Buffer.from(`// 確認用の追加機能。保存先から読み込めたかを返す\nexport const check = () => 'test v${version}: OK'\n`),
  'dummy.bin': randomBytes(SIZE_MB * 1024 * 1024),
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
for (const [name, data] of Object.entries(files)) writeFileSync(`${dir}/${name}`, data)

const manifest = {
  id: 'test',
  version,
  entry: 'index.js',
  files: Object.entries(files).map(([path, data]) => ({ path, size: data.length, sha256: sha256(data) })),
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`addon test v${version} -> ${dir} (${SIZE_MB} MB)`)
