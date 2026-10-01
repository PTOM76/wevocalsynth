// Spleeter 2stems（sherpa-onnx の ONNX 版）をブラウザで動かす実験
import * as ort from 'onnxruntime-web'
import { BINS, HOP, N_FFT, istftFrameAdd, stftFrame } from './stft.js'

const RATE = 44100
/** モデルに1回で渡すフレーム数（モデルの入力の形で決まっている） */
const SPLIT = 512
/** モデルが扱う周波数ビンの数（約 11kHz まで） */
const MODEL_BINS = 1024
const EPS = 1e-10

const $ = (id) => document.getElementById(id)
const log = (s) => {
  $('log').textContent += s + '\n'
}
log(`crossOriginIsolated: ${crossOriginIsolated}（true ならマルチスレッドが使える）, WebGPU: ${'gpu' in navigator}`)

let sessions = null
let sessionsKey = ''

async function loadSessions(model, backend) {
  const key = `${model}/${backend}`
  if (sessions && sessionsKey === key) return sessions
  ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency) : 1
  // fp32 は量子化なしの版（ファイル名に接尾辞がない）
  const dir = `./models/sherpa-onnx-spleeter-2stems${model === "fp32" ? "" : `-${model}`}/`
  const ext = model === "fp32" ? "onnx" : `${model}.onnx`
  const t0 = performance.now()
  const opts = { executionProviders: [backend] }
  sessions = {
    vocals: await ort.InferenceSession.create(`${dir}vocals.${ext}`, opts),
    accompaniment: await ort.InferenceSession.create(`${dir}accompaniment.${ext}`, opts),
  }
  sessionsKey = key
  log(`モデル読み込み: ${((performance.now() - t0) / 1000).toFixed(2)} 秒（${key}, threads ${ort.env.wasm.numThreads}）`)
  return sessions
}

async function decode(file) {
  // 44.1kHz の AudioContext でデコードすると、ブラウザがそのレートに変換してくれる
  const ctx = new AudioContext({ sampleRate: RATE })
  const buf = await ctx.decodeAudioData(await file.arrayBuffer())
  await ctx.close()
  const l = buf.getChannelData(0)
  const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
  return [l, r]
}

/**
 * 512 フレームずつ「STFT → 推論 → マスク → 逆STFT」を行う（1曲分のスペクトルを一度に持たないため）。
 * `extend`: モデルが扱わない 1024 ビンより上のマスクを、0 にする（'zeros'）か 1024 ビン目の値で延ばす（'edge'）
 */
async function separate(ch, s, extend, onProgress) {
  const n = ch[0].length
  const frames = Math.max(1, Math.ceil((n - N_FFT) / HOP) + 1)
  const out = { vocals: ch.map(() => new Float32Array(n)), accompaniment: ch.map(() => new Float32Array(n)) }
  const wsum = new Float32Array(n)
  const time = { stft: 0, infer: 0, istft: 0 }
  // 1ブロック分の複素スペクトル [ch][frame] と、モデルへの入力（振幅）
  const re = ch.map(() => Array.from({ length: SPLIT }, () => new Float32Array(BINS)))
  const im = ch.map(() => Array.from({ length: SPLIT }, () => new Float32Array(BINS)))
  const input = new Float32Array(2 * SPLIT * MODEL_BINS)
  const r = new Float32Array(BINS)
  const i_ = new Float32Array(BINS)

  for (let f0 = 0; f0 < frames; f0 += SPLIT) {
    const count = Math.min(SPLIT, frames - f0)
    let t = performance.now()
    input.fill(0)
    for (let c = 0; c < 2; c++) {
      for (let f = 0; f < count; f++) {
        stftFrame(ch[c], f0 + f, re[c][f], im[c][f])
        const o = (c * SPLIT + f) * MODEL_BINS
        for (let k = 0; k < MODEL_BINS; k++) input[o + k] = Math.hypot(re[c][f][k], im[c][f][k])
      }
    }
    time.stft += performance.now() - t

    t = performance.now()
    const x = new ort.Tensor('float32', input, [2, 1, SPLIT, MODEL_BINS])
    const v = (await s.vocals.run({ x })).y.data
    const a = (await s.accompaniment.run({ x })).y.data
    time.infer += performance.now() - t
    // 最初のブロックだけ、出力の値の様子を出す（WebGPU で結果がおかしい原因を探すため）
    if (f0 === 0) for (const [name, d] of [['入力', input], ['vocals', v], ['accompaniment', a]]) log(`  ${name}: ${stats(d)}`)

    t = performance.now()
    for (let c = 0; c < 2; c++) {
      for (let f = 0; f < count; f++) {
        const o = (c * SPLIT + f) * MODEL_BINS
        for (const [stem, mine, other] of [['vocals', v, a], ['accompaniment', a, v]]) {
          for (let k = 0; k < BINS; k++) {
            const kk = k < MODEL_BINS ? k : MODEL_BINS - 1
            const m = mine[o + kk] ** 2
            let mask = (m + EPS / 2) / (m + other[o + kk] ** 2 + EPS)
            if (k >= MODEL_BINS && extend === 'zeros') mask = 0
            r[k] = re[c][f][k] * mask
            i_[k] = im[c][f][k] * mask
          }
          // 窓の2乗の和は1回だけ足す（両方の音・両チャンネルで同じ）
          istftFrameAdd(r, i_, f0 + f, out[stem][c], c === 0 && stem === 'vocals' ? wsum : null)
        }
      }
    }
    time.istft += performance.now() - t
    onProgress(Math.min(1, (f0 + count) / frames))
    // 画面を固めない
    await new Promise((res) => setTimeout(res))
  }
  for (const stem of Object.values(out))
    for (const y of stem) for (let i = 0; i < n; i++) y[i] = wsum[i] > 1e-8 ? y[i] / wsum[i] : 0
  return { out, time }
}

/** 配列の最小・最大・平均と、NaN・Infinity・0 の数 */
function stats(d) {
  let min = Infinity, max = -Infinity, sum = 0, nan = 0, inf = 0, zero = 0
  for (const x of d) {
    if (Number.isNaN(x)) nan++
    else if (!Number.isFinite(x)) inf++
    else {
      if (x === 0) zero++
      min = Math.min(min, x)
      max = Math.max(max, x)
      sum += x
    }
  }
  return `min ${min.toExponential(2)} max ${max.toExponential(2)} mean ${(sum / d.length).toExponential(2)} NaN ${nan} Inf ${inf} 0 ${zero}/${d.length}`
}

function wav(ch) {
  const n = ch[0].length
  const buf = new ArrayBuffer(44 + n * ch.length * 2)
  const v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch.length * 2, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch.length, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * ch.length * 2, true); v.setUint16(32, ch.length * 2, true)
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * ch.length * 2, true)
  let o = 44
  for (let i = 0; i < n; i++)
    for (const c of ch) (v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 32767, true), (o += 2))
  return new Blob([buf], { type: 'audio/wav' })
}

$('run').onclick = async () => {
  const file = $('file').files[0]
  if (!file) return log('ファイルを選んでください')
  $('run').disabled = true
  try {
    const s = await loadSessions($('model').value, $('backend').value)
    const ch = await decode(file)
    const sec = ch[0].length / RATE
    const t0 = performance.now()
    const { out, time } = await separate(ch, s, $('extend').value, (p) => ($('progress').value = p))
    const total = (performance.now() - t0) / 1000
    log(`${file.name}: ${sec.toFixed(1)} 秒の音声を ${total.toFixed(2)} 秒で処理（RTF ${(total / sec).toFixed(3)}）`)
    log(`  内訳: STFT ${(time.stft / 1000).toFixed(2)} 秒 / 推論 ${(time.infer / 1000).toFixed(2)} 秒 / マスク＋逆STFT ${(time.istft / 1000).toFixed(2)} 秒`)
    if (performance.memory) log(`  JS ヒープ: ${(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(0)} MB`)
    const base = file.name.replace(/\.[^.]+$/, '')
    for (const stem of ['vocals', 'accompaniment']) {
      const url = URL.createObjectURL(wav(out[stem]))
      $(stem).src = url
      $(`${stem}-dl`).href = url
      $(`${stem}-dl`).download = `${base}.${stem}.${$('extend').value}.wav`
    }
  } catch (e) {
    log('エラー: ' + (e?.stack ?? e))
  } finally {
    $('run').disabled = false
  }
}
