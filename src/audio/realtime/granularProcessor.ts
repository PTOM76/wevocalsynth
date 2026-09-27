// リアルタイム試聴用の AudioWorklet。グラニュラー方式でピッチ変更・時間伸縮を行う。
//
// 約43ms の断片（グレイン）を半分ずつ重ねて出力する。各グレインは元音声を
// ピッチ比の速さで読み（音の高さが変わる）、グレインの読み始め位置は出力 1 サンプルあたり
// 1 / 伸縮率 だけ進む（長さが変わる）。範囲の終わりに来たら先頭に戻ってループする。
// 品質は WSOLA より粗いが、パラメータ変更が即座に反映される。

// AudioWorkletGlobalScope の型は DOM の型定義に含まれないため、使う分だけ宣言する
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

/** メインスレッドから送るメッセージ */
export type GranularMessage =
  | { type: 'load'; channels: Float32Array[] }
  | { type: 'params'; semitones: number; stretch: number }

const GRAIN = 2048
const HOP = GRAIN / 2

// periodic Hann 窓: 50% 重ねると総和がちょうど 1 になる
const WINDOW = Float32Array.from({ length: GRAIN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / GRAIN))

class GranularProcessor extends AudioWorkletProcessor {
  private channels: Float32Array[] = []
  private ratio = 1
  private stretch = 1
  /** 次のグレインの読み始め位置（元音声のサンプル位置） */
  private readPos = 0
  /** 出力側で現在のグレイン内の位置（0〜HOP-1） */
  private phase = 0
  /** 重なっている2つのグレインの読み始め位置（[新しい方, 古い方]） */
  private grains = [0, 0]

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<GranularMessage>) => {
      const m = e.data
      if (m.type === 'load') {
        this.channels = m.channels
        this.readPos = 0
        this.phase = 0
        this.grains = [0, 0]
      } else {
        this.ratio = 2 ** (m.semitones / 12)
        this.stretch = m.stretch
      }
    }
  }

  /** チャンネル `ch` を位置 `pos` で線形補間して読む（範囲外はループ） */
  private sample(ch: Float32Array, pos: number) {
    const len = ch.length
    const p = ((pos % len) + len) % len
    const i = Math.floor(p)
    const g = p - i
    return ch[i] + (ch[(i + 1) % len] - ch[i]) * g
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]
    const len = this.channels[0]?.length ?? 0
    if (!len) return true
    const frames = out[0].length
    for (let n = 0; n < frames; n++) {
      if (this.phase === 0) {
        // 新しいグレインを始める。読み始め位置は伸縮率に応じて進める
        this.grains = [this.readPos, this.grains[0]]
        this.readPos = (this.readPos + HOP / this.stretch) % len
      }
      // 新しいグレインは窓の前半、古いグレインは窓の後半を使う
      const wNew = WINDOW[this.phase]
      const wOld = WINDOW[this.phase + HOP]
      const posNew = this.grains[0] + this.phase * this.ratio
      const posOld = this.grains[1] + (this.phase + HOP) * this.ratio
      for (let c = 0; c < out.length; c++) {
        const ch = this.channels[Math.min(c, this.channels.length - 1)]
        out[c][n] = this.sample(ch, posNew) * wNew + this.sample(ch, posOld) * wOld
      }
      this.phase = (this.phase + 1) % HOP
    }
    return true
  }
}

registerProcessor('granular-preview', GranularProcessor)
