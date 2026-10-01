// 追加機能の配信実験用: dist/addons/test/ に数十MBのダミーファイルとマニフェストを置く（ビルド後に実行する）
// モデルファイルを GitHub Pages から配れるか確かめるためのもので、実験が終わったら消す
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const SIZE_MB = Number(process.env.ADDON_TEST_MB ?? 40)
const dir = 'dist/addons/test'
mkdirSync(dir, { recursive: true })

const data = randomBytes(SIZE_MB * 1024 * 1024)
writeFileSync(`${dir}/dummy.bin`, data)

const manifest = {
  id: 'test',
  version: '0.0.0',
  files: [{ path: 'dummy.bin', size: data.length, sha256: createHash('sha256').update(data).digest('hex') }],
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`addon test -> ${dir}/dummy.bin (${SIZE_MB} MB)`)
