#!/usr/bin/env node
// コードの地図: 各ファイルの 1 行目の説明を、フォルダーごとに並べて表示する（どこを開けばよいかを探すため）
import fs from 'node:fs'
import path from 'node:path'

const usage = `使い方: node scripts/map.mjs [フォルダー...] [--check] [--write]

  フォルダーを省くと src と dsp/src
  --check  1 行目に説明のないファイルを表示する（あれば終了コード 1）
  --write  docs/STRUCTURE.md の <!-- map:start --> と <!-- map:end --> の間を書き換える`

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(usage)
  process.exit(0)
}
const roots = args.filter((a) => !a.startsWith('--'))
const dirs = roots.length ? roots : ['src', 'dsp/src']
const EXT = /\.(ts|tsx|rs|mjs)$/

/** `dir` の下のソースファイル（そのフォルダーのファイルを名前の順に並べてから、サブフォルダー） */
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.name !== 'node_modules' && !e.name.startsWith('.'))
  const byName = (a, b) => a.name.localeCompare(b.name)
  const files = entries.filter((e) => e.isFile() && EXT.test(e.name) && !e.name.endsWith('.d.ts')).sort(byName)
  const subdirs = entries.filter((e) => e.isDirectory()).sort(byName)
  return [...files.map((e) => path.join(dir, e.name).replaceAll('\\', '/')), ...subdirs.flatMap((e) => walk(path.join(dir, e.name)))]
}

/** 説明（最初の行の `// …`、`//! …`、または `/** …` の最初の文）。なければ null */
function header(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim())
  const i = lines.findIndex((l) => l)
  const first = lines[i] ?? ''
  if (/^\/\/!?/.test(first)) return first.replace(/^\/\/!?\s*/, '')
  if (!first.startsWith('/**')) return null
  // 複数行の doc コメントは、最初の中身の行
  const text = first === '/**' ? (lines[i + 1] ?? '').replace(/^\*\s?/, '') : first.replace(/^\/\*\*\s*/, '')
  return text.replace(/\s*\*\/$/, '') || null
}

const files = dirs.flatMap(walk)
const lines = []
const missing = []
let current = ''
for (const f of files) {
  const dir = path.posix.dirname(f)
  if (dir !== current) {
    current = dir
    lines.push(`\n${dir}/`)
  }
  const h = header(f)
  if (h === null) missing.push(f)
  lines.push(`  ${path.posix.basename(f)}  ${h ?? '（説明なし）'}`)
}
const text = lines.join('\n').trim()

if (args.includes('--check')) {
  if (missing.length) console.log(`1 行目に説明のないファイル ${missing.length} 件:\n  ${missing.join('\n  ')}`)
  else console.log(`すべてのファイルに説明がある（${files.length} ファイル）`)
  process.exitCode = missing.length ? 1 : 0
} else if (args.includes('--write')) {
  const doc = 'docs/STRUCTURE.md'
  const s = fs.readFileSync(doc, 'utf8')
  const start = '<!-- map:start -->'
  const end = '<!-- map:end -->'
  const a = s.indexOf(start)
  const b = s.indexOf(end)
  if (a < 0 || b < a) throw new Error(`${doc} に ${start} と ${end} がない`)
  fs.writeFileSync(doc, `${s.slice(0, a + start.length)}\n\`\`\`\n${text}\n\`\`\`\n${s.slice(b)}`)
  console.log(`${doc} を書き換えた（${files.length} ファイル）`)
} else {
  console.log(text)
}
