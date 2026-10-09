// フェーダー（音量、パン、位相の反転）の計算。WeVocal Studio と共通にするため wevocal-lib に移した（ここは読み直すだけ）
export { DEFAULT_FADER, isNeutralFader, faderGain, applyFader, makePanner, setFaderNodes, faderEffect, type TrackFader } from 'wevocal-lib'
