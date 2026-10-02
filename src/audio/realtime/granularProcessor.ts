// リアルタイム試聴用の AudioWorklet。グラニュラー方式でピッチ変更・時間伸縮を行う。
//
// 約43ms の断片（グレイン）を半分ずつ重ねて出力する。各グレインは元音声を
// ピッチ比の速さで読み（音の高さが変わる）、グレインの読み始め位置は出力 1 サンプルあたり
// 1 / 伸縮率 だけ進む（長さが変わる）。範囲の終わりに来たら先頭に戻ってループする。
// 品質は WSOLA より粗いが、パラメータ変更が即座に反映される。
//
// 位置合わせ（既定で ON。`align` メッセージで切り替え）: 新しいグレインの読み始めを、決まった位置の前後 ±ALIGN_SEC で探し、
// 鳴っているグレインの自然な続きと最も似ている位置（正規化した相互相関）にする（WSOLA と同じ考え方）。
// 重なる 2 つのグレインの位相がそろい、ざらつき・うなりが減る。読み進める基準の位置は動かさないので、長さはずれない。

// AudioWorkletGlobalScope の型は DOM の型定義に含まれないため、使う分だけ宣言する
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void
declare const sampleRate: number
declare const currentTime: number

/** メインスレッドから送るメッセージ */
export type GranularMessage =
  | { type: 'load'; channels: Float32Array[] }
  | { type: 'params'; semitones: number; stretch: number }
  /** 読み位置を範囲の先頭から `pos` サンプルへ移す */
  | { type: 'seek'; pos: number }
  /** グレインの位置合わせを使うか */
  | { type: 'align'; on: boolean }

/** メインスレッドへ送る今の読み位置（再生位置の線用）。`pos` は範囲の先頭からのサンプル数、`time` はその時の AudioContext の時刻 */
export interface GranularPosition {
  pos: number
  time: number
  stretch: number
}

/** 読み位置を知らせる間隔（秒） */
const REPORT_SEC = 1 / 30

const GRAIN = 2048
const HOP = GRAIN / 2
/** 位置合わせで探す幅（秒）。約 100Hz までの声の 1 周期分 */
const ALIGN_SEC = 0.01
/**
 * 位置合わせの相関を計算するときの間引き（重なる区間を何サンプルおきに比べるか）と、粗い探索の刻み。
 * 音声処理のスレッドで 128 サンプルごとの締め切りに間に合わせるため、比べる点を減らす
 */
const ALIGN_STRIDE = 8
const COARSE_STEP = 4

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
  /** 前に読み位置を知らせてからの出力サンプル数 */
  private sinceReport = 0
  /** グレインの位置合わせを使うか */
  private align = true
  /** 位置合わせで比べる、鳴っているグレインの続きの波形（作り直さないよう使い回す） */
  private ref = new Float32Array(Math.ceil(HOP / ALIGN_STRIDE))

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<GranularMessage>) => {
      const m = e.data
      if (m.type === 'load') {
        this.channels = m.channels
        this.readPos = 0
        this.phase = 0
        this.grains = [0, 0]
      } else if (m.type === 'seek') {
        // 次のブロックから新しい位置のグレインを始める（鳴っている古いグレインとは窓で重なってなめらかにつながる）
        this.readPos = m.pos
        this.phase = 0
      } else if (m.type === 'align') {
        this.align = m.on
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

  /**
   * 新しいグレインの読み始め位置を決める。`nominal` の前後で、鳴っているグレイン（読み始め `current`）の自然な続き
   * （重なる区間で読む位置 = current + HOP × ピッチ比 から）と最も似ている位置を返す。比べるのは 1 チャンネル目
   */
  private alignedStart(current: number, nominal: number) {
    const ch = this.channels[0]
    const step = ALIGN_STRIDE * this.ratio
    const natural = current + HOP * this.ratio
    const ref = this.ref
    for (let i = 0; i < ref.length; i++) ref[i] = this.sample(ch, natural + i * step)
    const score = (cand: number) => {
      let dot = 0
      let e = 0
      for (let i = 0; i < ref.length; i++) {
        const y = this.sample(ch, cand + i * step)
        dot += ref[i] * y
        e += y * y
      }
      return dot / (Math.sqrt(e) + 1e-9)
    }
    const tol = Math.round(ALIGN_SEC * sampleRate)
    let best = nominal
    let bestScore = -Infinity
    // 粗く探してから、良かった位置のまわりを 1 サンプル刻みで探す
    for (let off = -tol; off <= tol; off += COARSE_STEP) {
      const s = score(nominal + off)
      if (s > bestScore) [best, bestScore] = [nominal + off, s]
    }
    const coarse = best
    for (let off = -COARSE_STEP + 1; off < COARSE_STEP; off++) {
      const s = score(coarse + off)
      if (s > bestScore) [best, bestScore] = [coarse + off, s]
    }
    return best
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]
    const len = this.channels[0]?.length ?? 0
    if (!len) return true
    const frames = out[0].length
    for (let n = 0; n < frames; n++) {
      if (this.phase === 0) {
        // 新しいグレインを始める。読み始め位置は伸縮率に応じて進める（位置合わせで動かすのはグレインの読み始めだけ）
        const start = this.align ? this.alignedStart(this.grains[0], this.readPos) : this.readPos
        this.grains = [start, this.grains[0]]
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
    this.sinceReport += frames
    if (this.sinceReport >= REPORT_SEC * sampleRate) {
      this.sinceReport = 0
      // 読み始め位置はグレインごとに飛ぶので、グレイン内の進み（出力 1 サンプルあたり 1 / 伸縮率）を足して連続にする。
      // 時刻はこのブロックを出し終えたとき
      const m: GranularPosition = {
        pos: this.grains[0] + this.phase / this.stretch,
        time: currentTime + frames / sampleRate,
        stretch: this.stretch,
      }
      this.port.postMessage(m)
    }
    return true
  }
}

registerProcessor('granular-preview', GranularProcessor)
