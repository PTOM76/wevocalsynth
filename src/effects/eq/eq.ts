// トラックのグラフィック EQ の計算。WeVocal Studio と共通にするため wevocal-lib に移した（ここは読み直すだけ）
export { eqRange, setEqRange, eqFreqs, flatEq, DEFAULT_EQ, isFlatEq, resizeEq, parseEq, buildEqChain, applyEq, createLiveEq, updateLiveEq, disconnectLiveEq, eqEffect, type TrackEq, type EqRange, type EqBands, type LiveEq } from 'wevocal-lib'
