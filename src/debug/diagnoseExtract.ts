import { tryCreateExtractor, VOCAL_MODELS, type ExtractOptions } from '../audio/vocalExtract'
import { addonFileUrl, installedManifest } from '../addons/addons'

/**
 * ボーカル抽出の診断（設定の開発者向け）。iOS で抽出が RangeError: Out of memory になる原因を、端末で確かめるためのもの。
 * - 環境: 共有メモリ（SharedArrayBuffer）が使えるか
 * - wasm のメモリ: 上限の違うメモリ（共有 / 共有でない）を作れるか。WebKit は共有メモリの上限の分を作った時点で予約するので、
 *   上限 4GB の共有メモリ（ONNX Runtime のスレッド用の作り）だけが失敗するなら、予約の枠が原因
 * - 実行環境: 作る → 手放す → すぐにもう一度作る、で 2 回目が通るか
 * メモリの試しは使い捨ての Worker の中で行い、終わったら止める（診断で予約を残さない）
 */

/** Worker の中で、メモリを作れるか試す。結果は1行ずつ返す */
const MEMORY_TEST = `
const tests = [
  ['共有、上限 4GB', { initial: 17, maximum: 65536, shared: true }],
  ['共有、上限 1GB', { initial: 17, maximum: 16384, shared: true }],
  ['共有、上限 256MB', { initial: 17, maximum: 4096, shared: true }],
  ['共有でない、上限 4GB', { initial: 17, maximum: 65536 }],
  ['共有でない、最初から 256MB', { initial: 4096 }],
]
const out = []
for (const [name, desc] of tests) {
  try { new WebAssembly.Memory(desc); out.push(name + ': OK') }
  catch (e) { out.push(name + ': 失敗 (' + e + ')') }
}
postMessage(out)
`

function testMemory(): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([MEMORY_TEST], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const done = (lines: string[]) => {
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve(lines)
    }
    worker.onmessage = (e: MessageEvent<string[]>) => done(e.data)
    worker.onerror = (e) => done([`Worker を作れない: ${e.message}`])
  })
}

/** Worker の中で `bytes` の wasm をコンパイルする（実行環境の 28MB の wasm。コンパイルした機械語の置き場が足りるか） */
const COMPILE_TEST = `onmessage = async (e) => {
  const t0 = performance.now()
  try { await WebAssembly.compile(e.data); postMessage('OK（' + ((performance.now() - t0) / 1000).toFixed(1) + ' 秒）') }
  catch (err) { postMessage('失敗 (' + err + ')') }
}`

function testCompile(bytes: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([COMPILE_TEST], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const done = (line: string) => {
      worker.terminate()
      URL.revokeObjectURL(url)
      resolve(line)
    }
    worker.onmessage = (e: MessageEvent<string>) => done(e.data)
    worker.onerror = (e) => done(`Worker を作れない: ${e.message}`)
    worker.postMessage(bytes, [bytes])
  })
}

/** 診断を行い、結果を1行ずつ `log` に渡す */
export async function diagnoseExtract(o: ExtractOptions, log: (line: string) => void) {
  const nav = navigator as Navigator & { standalone?: boolean; deviceMemory?: number }
  log(`ブラウザ: ${navigator.userAgent}`)
  log(`PWA として開いている: ${window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true}`)
  log(`crossOriginIsolated: ${String(window.crossOriginIsolated)} / SharedArrayBuffer: ${typeof SharedArrayBuffer}`)
  if (nav.deviceMemory) log(`deviceMemory: ${nav.deviceMemory}GB`)
  log('--- wasm のメモリ（使い捨ての Worker の中）')
  for (const line of await testMemory()) log(line)
  const runtime = await installedManifest('vocal-extractor')
  const ortWasm = runtime?.files.find((f) => /ort-wasm.*\.wasm$/.test(f.path))
  if (ortWasm) {
    const bytes = await (await fetch(addonFileUrl('vocal-extractor', ortWasm.path))).arrayBuffer()
    log(`--- 実行環境の wasm（${(bytes.byteLength / 2 ** 20).toFixed(0)}MB）のコンパイル`)
    log(`コンパイル: ${await testCompile(bytes)}`)
  }
  if (!runtime || !(await installedManifest(VOCAL_MODELS[o.model].addon))) {
    log('ボーカル抽出の追加機能（実行環境か、選んでいるモデル）が未導入のため、実行環境の試しは省略')
    return
  }
  log('--- 抽出の実行環境（作る → 手放す、を 2 回続ける）')
  for (const n of [1, 2]) {
    const t0 = performance.now()
    try {
      await tryCreateExtractor(o)
      log(`${n} 回目: OK（${((performance.now() - t0) / 1000).toFixed(1)} 秒）`)
    } catch (e) {
      log(`${n} 回目: 失敗（${((performance.now() - t0) / 1000).toFixed(1)} 秒）${String(e)}`)
    }
  }
}
