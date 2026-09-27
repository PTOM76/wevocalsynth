import type { Spectrogram } from '../../dsp/engine'

/** スペクトログラムの配色（magma 風）。明るさ 0〜255 → RGB */
const SPEC_LUT = (() => {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.25, 59, 15, 112],
    [0.5, 140, 41, 129],
    [0.75, 222, 73, 104],
    [0.9, 254, 159, 109],
    [1, 252, 253, 191],
  ]
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const u = i / 255
    const j = Math.max(1, stops.findIndex((st) => st[0] >= u))
    const [u0, ...c0] = stops[j - 1]
    const [u1, ...c1] = stops[j]
    const g = (u - u0) / (u1 - u0 || 1)
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = Math.round(c0[k] + (c1[k] - c0[k]) * g)
  }
  return lut
})()

/** 表示範囲のスペクトログラムを width × height の画像にする（1列に複数フレームが入る場合は最大値） */
export function renderSpectrogram(spec: Spectrogram, width: number, height: number, viewStart: number, viewDur: number) {
  const img = new ImageData(width, height)
  const px = img.data
  for (let x = 0; x < width; x++) {
    const ka = Math.max(0, Math.floor((viewStart + (x / width) * viewDur) / spec.hopSec))
    const kb = Math.min(
      spec.frames - 1,
      Math.max(ka, Math.floor((viewStart + ((x + 1) / width) * viewDur) / spec.hopSec)),
    )
    for (let y = 0; y < height; y++) {
      const r = Math.round(((height - 1 - y) / (height - 1)) * (spec.rows - 1))
      let v = 0
      for (let k = ka; k <= kb; k++) v = Math.max(v, spec.data[k * spec.rows + r])
      const o = (y * width + x) * 4
      px[o] = SPEC_LUT[v * 3]
      px[o + 1] = SPEC_LUT[v * 3 + 1]
      px[o + 2] = SPEC_LUT[v * 3 + 2]
      px[o + 3] = 255
    }
  }
  return img
}
