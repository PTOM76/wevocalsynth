// 実験用の STFT / 逆STFT（後で wevocal-lib の Rust に移す）
// Spleeter（sherpa-onnx 版）に合わせる: n_fft 4096、hop 1024、Hann 窓、center なし

export const N_FFT = 4096
export const HOP = 1024
export const BINS = N_FFT / 2 + 1

/** 周期的な Hann 窓（torch.hann_window と同じ） */
export const WINDOW = Float32Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT))

// radix-2 FFT（その場で変換）。回転因子とビット反転の表は最初に作っておく
const LOG = Math.log2(N_FFT)
const COS = new Float32Array(N_FFT / 2)
const SIN = new Float32Array(N_FFT / 2)
for (let i = 0; i < N_FFT / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / N_FFT)
  SIN[i] = -Math.sin((2 * Math.PI * i) / N_FFT)
}
const REV = new Uint32Array(N_FFT)
for (let i = 0; i < N_FFT; i++) {
  let r = 0
  for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b)
  REV[i] = r
}

/** `inverse` なら逆変換（1/N は掛けない） */
export function fft(re, im, inverse = false) {
  for (let i = 0; i < N_FFT; i++) {
    const j = REV[i]
    if (j > i) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  const sign = inverse ? -1 : 1
  for (let size = 2; size <= N_FFT; size <<= 1) {
    const half = size >> 1
    const step = N_FFT / size
    for (let start = 0; start < N_FFT; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step]
        const wi = sign * SIN[k * step]
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** `x` の `frame` 番目のフレームの STFT を `re` / `im`（長さ BINS）に入れる。範囲外は 0 */
export function stftFrame(x, frame, re, im) {
  const bufRe = new Float32Array(N_FFT)
  const bufIm = new Float32Array(N_FFT)
  const at = frame * HOP
  for (let i = 0; i < N_FFT; i++) bufRe[i] = (x[at + i] ?? 0) * WINDOW[i]
  fft(bufRe, bufIm)
  re.set(bufRe.subarray(0, BINS))
  im.set(bufIm.subarray(0, BINS))
}

/** 片側スペクトル（長さ BINS）を逆変換し、窓を掛けて `out` の `frame` の位置に足す。`wsum` には窓の2乗を足す */
export function istftFrameAdd(re, im, frame, out, wsum) {
  const bufRe = new Float32Array(N_FFT)
  const bufIm = new Float32Array(N_FFT)
  bufRe.set(re)
  bufIm.set(im)
  // 実数信号になるよう、負の周波数側を共役で埋める
  for (let k = 1; k < N_FFT / 2; k++) {
    bufRe[N_FFT - k] = re[k]
    bufIm[N_FFT - k] = -im[k]
  }
  fft(bufRe, bufIm, true)
  const at = frame * HOP
  for (let i = 0; i < N_FFT && at + i < out.length; i++) {
    out[at + i] += (bufRe[i] / N_FFT) * WINDOW[i]
    if (wsum) wsum[at + i] += WINDOW[i] * WINDOW[i]
  }
}
