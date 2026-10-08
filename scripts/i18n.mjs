#!/usr/bin/env node
// 訳文の JSON をキー単位で読み書きする道具（JSON を直接開かずに済ませるため）。使い方は usage() を参照
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'ja_jp'

function usage() {
  console.log(`使い方: node scripts/i18n.mjs <コマンド> [引数] [--dir src/i18n] [--src src]

  get <key>...                 各言語の訳を表示する
  list [prefix]                先頭が一致するキーと ${BASE} の訳を表示する（--lang en で言語を変える）
  add <key> ja=… en=… …        全言語に足す（同じ分類の最後）。省いた言語には en を入れ、警告を表示する
  set <key> ja=… en=… …        指定した言語の訳を変える
  rm <key>...                  全言語から消す
  mv <old> <new>               キーの名前を変え、--src の中の '<old>' も書き換える
  check                        言語ごとのキーの欠けと、--src で見つからないキーを表示する
  fmt [--check]                キーを先頭の分類ごとにまとめ、全言語を ${BASE} と同じ並びにする（--check は書き換えずに確かめる）

  --dir  訳文のフォルダー（既定 src/i18n。例 analyzer/app/lang）
  --src  キーを探すフォルダー（既定は --dir の親）
  言語は ja、en、ko、zh_cn、zh_tw のように、ファイル名の先頭で指定できる`)
}

// 引数を位置引数とオプションに分ける
function parseArgs(argv) {
  const pos = []
  const opt = {}
  for (let i = 0; i < argv.length; i++) {
    // 値のないオプション（--check など）は true にする
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i]
    else pos.push(argv[i])
  }
  return { pos, opt }
}

// 1 行が 1 キーの JSON を、行の並び（空行を含む）を保ったまま扱う
class LangFile {
  constructor(file) {
    this.file = file
    this.lines = fs.readFileSync(file, 'utf8').split('\n')
    this.data = JSON.parse(this.lines.join('\n'))
  }
  // キーの行の位置（なければ -1）
  indexOf(key) {
    const head = `  ${JSON.stringify(key)}:`
    return this.lines.findIndex((l) => l.startsWith(head))
  }
  // キーのある行の一覧
  entryIndexes() {
    return this.lines.map((l, i) => (/^ {2}"/.test(l) ? i : -1)).filter((i) => i >= 0)
  }
  line(key, value) {
    return `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`
  }
  set(key, value) {
    const i = this.indexOf(key)
    if (i < 0) throw new Error(`${path.basename(this.file)} に ${key} がない`)
    this.lines[i] = this.line(key, value)
    this.data[key] = value
  }
  // 先頭の分類が最も長く一致するキーの後ろに足す
  add(key, value) {
    if (key in this.data) throw new Error(`${path.basename(this.file)} に ${key} がすでにある`)
    const parts = key.split('.')
    let at = -1
    for (let n = parts.length - 1; n > 0 && at < 0; n--) {
      const prefix = parts.slice(0, n).join('.') + '.'
      for (const i of this.entryIndexes()) if (this.keyAt(i).startsWith(prefix)) at = i
    }
    if (at < 0) at = this.entryIndexes().at(-1)
    this.lines.splice(at + 1, 0, this.line(key, value))
    this.data[key] = value
  }
  rm(key) {
    const i = this.indexOf(key)
    if (i < 0) return false
    this.lines.splice(i, 1)
    delete this.data[key]
    // 前後が両方空行になったら 1 つにする
    if (this.lines[i - 1] === '' && this.lines[i] === '') this.lines.splice(i, 1)
    return true
  }
  rename(from, to) {
    const i = this.indexOf(from)
    if (i < 0) throw new Error(`${path.basename(this.file)} に ${from} がない`)
    if (to in this.data) throw new Error(`${path.basename(this.file)} に ${to} がすでにある`)
    this.lines[i] = this.line(to, this.data[from])
    this.data[to] = this.data[from]
    delete this.data[from]
  }
  keyAt(i) {
    return JSON.parse(this.lines[i].trim().replace(/,$/, '').replace(/^("(?:[^"\\]|\\.)*"):.*$/, '$1'))
  }
  // order の並びで書き直す（分類の間に空行）。order にないキーは同じ分類の最後に置く
  reorder(groups) {
    const rest = Object.keys(this.data).filter((k) => !groups.some((g) => g.includes(k)))
    const blocks = groups.map((g) => {
      const prefix = g[0].split('.')[0]
      return [...g.filter((k) => k in this.data), ...rest.filter((k) => k.split('.')[0] === prefix)]
    })
    const orphan = rest.filter((k) => !groups.some((g) => g[0].split('.')[0] === k.split('.')[0]))
    if (orphan.length) blocks.push(orphan)
    const tail = this.lines.at(-1) === '' ? [''] : []
    this.lines = ['{', ...blocks.filter((b) => b.length).flatMap((b, i) => [...(i ? [''] : []), ...b.map((k) => this.line(k, this.data[k]))]), '}', ...tail]
  }
  // カンマを整えた本文（最後のキーだけカンマを付けない）
  text() {
    const entries = this.entryIndexes()
    for (const i of entries) if (!this.lines[i].endsWith(',')) this.lines[i] += ','
    const last = entries.at(-1)
    this.lines[last] = this.lines[last].replace(/,$/, '')
    const text = this.lines.join('\n')
    JSON.parse(text)
    return text
  }
  save() {
    fs.writeFileSync(this.file, this.text())
  }
}

function loadLangs(dir) {
  const names = fs.readdirSync(dir).filter((f) => /^[a-z]{2}_[a-z]{2}\.json$/.test(f)).sort()
  if (!names.length) throw new Error(`${dir} に訳文の JSON がない`)
  return Object.fromEntries(names.map((f) => [f.slice(0, -5), new LangFile(path.join(dir, f))]))
}

// ja=… のような引数を、言語の名前と訳に分ける
function parseValues(args, langs) {
  const out = {}
  for (const a of args) {
    const eq = a.indexOf('=')
    if (eq < 0) throw new Error(`言語=訳 の形ではない: ${a}`)
    const short = a.slice(0, eq)
    const lang = Object.keys(langs).find((l) => l === short || l.startsWith(short + '_'))
    if (!lang) throw new Error(`言語がない: ${short}`)
    out[lang] = a.slice(eq + 1)
  }
  return out
}

// --src の中のソースファイルを列挙する
function sourceFiles(root) {
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p)
    }
  }
  walk(root)
  return out
}

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2))
  const [cmd, ...args] = pos
  if (!cmd || cmd === 'help') return usage()
  const dir = opt.dir ?? 'src/i18n'
  const src = opt.src ?? path.dirname(dir)
  const langs = loadLangs(dir)
  const base = langs[BASE] ?? Object.values(langs)[0]

  switch (cmd) {
    case 'get':
      for (const key of args) {
        console.log(key)
        for (const [l, f] of Object.entries(langs)) console.log(`  ${l}: ${f.data[key] ?? '(なし)'}`)
      }
      break
    case 'list': {
      const f = opt.lang ? langs[Object.keys(parseValues([`${opt.lang}=`], langs))[0]] : base
      for (const [k, v] of Object.entries(f.data)) if (!args[0] || k.startsWith(args[0])) console.log(`${k}\t${v}`)
      break
    }
    case 'add': {
      const [key, ...rest] = args
      const values = parseValues(rest, langs)
      const fallback = values.en_us ?? values[BASE]
      if (fallback === undefined) throw new Error('少なくとも ja か en を指定する')
      for (const [l, f] of Object.entries(langs)) {
        if (!(l in values)) console.warn(`警告: ${l} は未翻訳のため ${values.en_us !== undefined ? 'en_us' : BASE} の訳を入れた`)
        f.add(key, values[l] ?? fallback)
      }
      Object.values(langs).forEach((f) => f.save())
      console.log(`追加: ${key}`)
      break
    }
    case 'set': {
      const [key, ...rest] = args
      for (const [l, v] of Object.entries(parseValues(rest, langs))) {
        langs[l].set(key, v)
        langs[l].save()
      }
      console.log(`変更: ${key}`)
      break
    }
    case 'rm':
      for (const key of args) {
        const hit = Object.values(langs).map((f) => f.rm(key)).some(Boolean)
        console.log(hit ? `削除: ${key}` : `なし: ${key}`)
      }
      Object.values(langs).forEach((f) => f.save())
      break
    case 'mv': {
      const [from, to] = args
      for (const f of Object.values(langs)) f.rename(from, to)
      Object.values(langs).forEach((f) => f.save())
      // 引用符で囲まれたキーだけを書き換える
      const re = new RegExp(`(['"\`])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g')
      for (const p of sourceFiles(src)) {
        const s = fs.readFileSync(p, 'utf8')
        const t = s.replace(re, `$1${to}$1`)
        if (t !== s) {
          fs.writeFileSync(p, t)
          console.log(`書き換え: ${p}`)
        }
      }
      console.log(`名前の変更: ${from} → ${to}`)
      break
    }
    case 'check': {
      let bad = 0
      const keys = Object.keys(base.data)
      for (const [l, f] of Object.entries(langs)) {
        const missing = keys.filter((k) => !(k in f.data))
        const extra = Object.keys(f.data).filter((k) => !(k in base.data))
        if (missing.length) console.log(`${l} に欠けている: ${missing.join(', ')}`)
        if (extra.length) console.log(`${l} だけにある: ${extra.join(', ')}`)
        bad += missing.length + extra.length
      }
      // キーの文字列がソースに見つからないもの（動的に組み立てるキーは誤検出になる）
      const text = sourceFiles(src).map((p) => fs.readFileSync(p, 'utf8')).join('\n')
      const unused = keys.filter((k) => !text.includes(`'${k}'`) && !text.includes(`"${k}"`) && !text.includes(`\`${k}\``))
      if (unused.length) console.log(`ソースに見つからない（動的なキーの可能性あり）${unused.length} 件:\n  ${unused.join('\n  ')}`)
      console.log(bad ? `言語の間の不一致: ${bad} 件` : `言語の間の不一致なし（${keys.length} キー、${Object.keys(langs).length} 言語）`)
      process.exitCode = bad ? 1 : 0
      break
    }
    case 'fmt': {
      // 分類（キーの最初の「.」まで）ごとに、${BASE} で最初に出てくる順にまとめる
      const groups = new Map()
      for (const k of Object.keys(base.data)) {
        const prefix = k.split('.')[0]
        if (!groups.has(prefix)) groups.set(prefix, [])
        groups.get(prefix).push(k)
      }
      const checkOnly = opt.check === true
      let changed = 0
      for (const f of Object.values(langs)) {
        const before = fs.readFileSync(f.file, 'utf8')
        f.reorder([...groups.values()])
        const after = f.text()
        if (before === after) continue
        changed++
        if (!checkOnly) fs.writeFileSync(f.file, after)
        console.log(`${checkOnly ? '整っていない' : '整形した'}: ${path.basename(f.file)}`)
      }
      if (!changed) console.log('整っている')
      process.exitCode = changed && checkOnly ? 1 : 0
      break
    }
    default:
      usage()
      process.exitCode = 1
  }
}

try {
  main()
} catch (e) {
  console.error(`エラー: ${e.message}`)
  process.exitCode = 1
}
