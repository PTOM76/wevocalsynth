/**
 * 抽出のあとにアプリが落ちたかを、次の起動で知るための印（localStorage）。
 * 抽出の前に付け、結果を反映して少し経ったら外す。起動時に残っていれば、抽出の前後で落ちた（iOS のメモリ不足など）
 */
const KEY = 'wevocalsynth.extractGuard'
/** 結果を反映してから印を外すまで（ミリ秒）。反映の直後の解析や自動保存の間に落ちることがあるため */
const SETTLE_MS = 10_000

let timer = 0

export function markExtracting() {
  clearTimeout(timer)
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 保存できなければ検知しないだけ
  }
}

/** 印を外す。`settle` なら少し待ってから */
export function clearExtracting(settle = false) {
  clearTimeout(timer)
  const clear = () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // 何もしない
    }
  }
  if (settle) timer = window.setTimeout(clear, SETTLE_MS)
  else clear()
}

/** 前回、抽出の前後で落ちたか（起動時に 1 回だけ。読んだら外す） */
export function crashedDuringExtract() {
  try {
    const v = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    return v === '1'
  } catch {
    return false
  }
}