import { useEffect, useRef } from 'react'
import { usePalette } from './waveform/usePalette'

/** 表示する範囲（dB） */
const MIN_DB = -60
/** 表示が下がる速さ（dB / 秒）。上がるときはすぐ上げる */
const FALL_DB_PER_SEC = 30
/** ピークの印を残す時間（秒） */
const HOLD_SEC = 1
/** 再生していなくて表示も消えきったときの、確認の間隔（ミリ秒）。毎フレーム動かし続けないため */
const IDLE_MS = 250

const toRatio = (db: number) => Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB))

/**
 * 横向きのレベルメーター。`source` が返す AnalyserNode のピークを、毎フレーム Canvas に直接描く
 * （React の状態にすると、毎フレーム画面が描き直されて重くなるため。再生位置の線と同じ）。
 * 再生していないとき（source が null）は、ゆっくり下がって消える
 */
export default function LevelMeter({ source, width = 64, height = 6, label }: { source: () => AnalyserNode | null; width?: number; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { pal } = usePalette()
  // 描画のたびに作られる関数でもループを作り直さないよう、最新の source は ref から読む
  const sourceRef = useRef(source)
  sourceRef.current = source

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const g = canvas.getContext('2d')
    if (!g) return
    let buf = new Float32Array(1024)
    let shown = MIN_DB
    let hold = MIN_DB
    let holdAt = 0
    let last = performance.now()
    let drawn = ''
    let raf = 0
    let timer = 0

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const a = sourceRef.current()
      let peak = MIN_DB
      if (a) {
        if (buf.length !== a.fftSize) buf = new Float32Array(a.fftSize)
        a.getFloatTimeDomainData(buf)
        let m = 0
        for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]))
        peak = m > 0 ? 20 * Math.log10(m) : MIN_DB
      }
      shown = Math.max(peak, shown - FALL_DB_PER_SEC * dt)
      if (shown >= hold || now - holdAt > HOLD_SEC * 1000) {
        hold = shown
        holdAt = now
      }
      // 見た目が変わったときだけ描き直す
      const key = `${shown.toFixed(1)}:${hold.toFixed(1)}`
      if (key !== drawn) {
        drawn = key
        const w = canvas.width
        const h = canvas.height
        g.clearRect(0, 0, w, h)
        g.fillStyle = pal.action.hover
        g.fillRect(0, 0, w, h)
        // -12dB までは緑、-3dB までは黄、それより上は赤
        const segs: [number, number, string][] = [
          [MIN_DB, -12, pal.success.main],
          [-12, -3, pal.warning.main],
          [-3, 0, pal.error.main],
        ]
        for (const [lo, hi, color] of segs) {
          const x0 = toRatio(lo) * w
          const x1 = Math.min(toRatio(hi), toRatio(shown)) * w
          if (x1 > x0) {
            g.fillStyle = color
            g.fillRect(x0, 0, x1 - x0, h)
          }
        }
        if (hold > MIN_DB) {
          g.fillStyle = hold > -3 ? pal.error.main : pal.text.secondary
          g.fillRect(Math.min(w - 1, toRatio(hold) * w), 0, Math.max(1, dpr), h)
        }
      }
      // 鳴っていなくて表示も消えきったら、間隔をあけて確認する（再生が始まれば次の確認から毎フレームに戻る）
      if (!a && shown <= MIN_DB && hold <= MIN_DB) {
        timer = window.setTimeout(() => {
          last = performance.now()
          raf = requestAnimationFrame(frame)
        }, IDLE_MS)
      } else raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [width, height, pal])

  return <canvas ref={ref} role="meter" aria-label={label} style={{ width, height, display: 'block', borderRadius: 1 }} />
}
