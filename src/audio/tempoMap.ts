// テンポが途中で変わる曲のための、区間ごとのテンポと拍の位置。WeVocal Studio と共通にするため wevocal-lib に移した（ここは読み直すだけ）
export { tempoSegments, segmentAt, bpmAt, beatsIn, nearestBeat, stepBeat, type TempoSegment, type Beat } from 'wevocal-lib'
