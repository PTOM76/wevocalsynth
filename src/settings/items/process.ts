// 設定の項目の定義（処理、ピッチ解析、テンポ、ボーカル抽出）
import type { Algorithm } from '../../dsp/engine'
import type { F0Voicing, InitialMode, StemModel, VocalModel } from '../settings'
import { MEMORY_MB } from '../../constants/ui'
import { check, choice, defineItems, number, value } from './define'

/** 「処理」 */
export const process = defineItems('process', {
  // ボーカルと楽器のモードで使う処理方式（選択肢は表示の設定で変わるので画面は自前）
  vocalAlgorithm: value<Algorithm>('sola3', { label: 'settings.vocalAlgorithm' }),
  instrumentAlgorithm: value<Algorithm>('pv', { label: 'settings.instrumentAlgorithm' }),
  // 従来の処理方式（改良版があるもの）も選べるように表示する
  showLegacyAlgorithms: check(false, { label: 'settings.showLegacyAlgorithms', help: 'settings.showLegacyAlgorithmsHelp' }),
  // ファイルを開いたときの処理モード。auto は音声から自動判定する
  initialMode: choice<InitialMode>('auto', {
    label: 'settings.initialMode',
    options: [
      ['auto', 'settings.auto'],
      ['vocal', 'common.vocal'],
      ['instrument', 'common.instrument'],
    ],
  }),
  // 新しいトラックの EQ のバンドの数（トラックごとにダイアログでも切り替えられる）
  eqBands: choice<10 | 31>(10, { label: 'settings.eqBands', values: [10, 31], format: (v) => String(v) }),
  // メモリの節約（加工したトラックの原音を IndexedDB に退避する。auto はスマホとタブレットだけ。audio/originalStore.ts）
  saveMemory: choice<'auto' | 'on' | 'off'>('auto', {
    label: 'settings.saveMemory',
    help: 'settings.saveMemoryHelp',
    options: [
      ['auto', 'settings.saveMemoryAuto'],
      ['on', 'settings.saveMemoryOn'],
      ['off', 'settings.saveMemoryOff'],
    ],
  }),
})

/** 「ピッチ」 */
export const pitch = defineItems('pitch', {
  // ピッチ解析: 探す音の範囲（Hz）
  f0MinHz: number(60, { label: 'settings.f0MinHz', min: 40, max: 400, step: 1, unit: 'Hz' }),
  f0MaxHz: number(1000, { label: 'settings.f0MaxHz', min: 200, max: 2000, step: 10, unit: 'Hz' }),
  // ピッチ解析: 声とみなす判定の厳しさ
  f0Voicing: choice<F0Voicing>('normal', {
    label: 'settings.f0Voicing',
    options: [
      ['strict', 'settings.f0Strict'],
      ['normal', 'settings.f0Normal'],
      ['loose', 'settings.f0Loose'],
    ],
  }),
  // 「平らにする」の強さ（0〜1。1 未満なら元の揺れを少し残す）
  flattenStrength: choice<number>(1, { label: 'settings.flattenStrength', help: 'settings.flattenStrengthHelp', values: [1, 0.75, 0.5, 0.25], format: (s) => Math.round(s * 100) + '%' }),
  // ピッチ解析: これより小さい音量（dB）は無音とみなす
  f0SilenceDb: number(-50, { label: 'settings.f0SilenceDb', min: -80, max: -20, step: 1, unit: 'dB' }),
})

/** 「テンポ」 */
export const tempo = defineItems('tempo', {
  // ファイルを開いたときにテンポを自動解析し、BPM と 1 拍目の位置を入れる
  autoTempo: check(true, { label: 'settings.autoTempo', help: 'settings.autoTempoHelp' }),
  // 自動解析で、途中でテンポが変わるかも調べる感度（変わっていたらダイアログで尋ねる。audio/tempoChange.ts）
  tempoChange: choice<'off' | 'low' | 'normal'>('low', {
    label: 'settings.tempoChange',
    help: 'settings.tempoChangeHelp',
    options: [
      ['off', 'settings.tempoChangeOff'],
      ['low', 'settings.tempoChangeLow'],
      ['normal', 'settings.tempoChangeNormal'],
    ],
  }),
  // テンポを自動解析しないとき（設定で切ったときなど）の BPM
  defaultBpm: number(120, { label: 'settings.defaultBpm', help: 'settings.defaultBpmHelp', min: 20, max: 300, step: 1, unit: 'BPM', round: (v) => Math.round(v * 100) / 100 }),
  // 拍の目安線を波形に表示する
  showBeatGrid: check(true, { label: 'settings.showBeatGrid' }),
  // BPM を手で変えたら、全トラックをそのテンポに合わせて伸縮する（ピッチは変えない）
  tempoStretch: check(false, { label: 'settings.tempoStretch', help: 'settings.tempoStretchHelp' }),
})

/** 「ボーカル抽出」 */
export const vocal = defineItems('vocal', {
  // ボーカル抽出のモデル。fp16、int8、fp32 は Spleeter、voc-ft、inst-hq4、kara2 は UVR の MDX-Net（extractor/src/mdxModels.ts）
  // int8: CPU でも fp16 より速く、GPU も使える（fp16 は WebGPU で動かない。docs/DECISIONS.md）
  vocalModel: value<VocalModel>('int8', { label: 'settings.vocalModel' }),
  // メモリを空けてから抽出する（作業を保存して開き直し、ほかに何も読み込んでいない状態で抽出する）
  vocalFreshExtract: check(false, { label: 'settings.vocalFresh', help: 'settings.vocalFreshHelp' }),
  // GPU（WebGPU）を使う。使えない環境やモデル（fp16）では CPU（WASM）で動く。押せるかがモデルで変わるので画面は自前
  vocalGpu: value(true, { label: 'settings.vocalGpu', help: 'settings.vocalGpuHelp' }),
  // 約 11kHz より上を残す（既定は消す。残すと声は明るいが、シンバルなどが混ざりやすい）
  // 和音の分離と一音ずつ切り出しの前に、ボーカルを取り出す（伴奏があると精度が下がるため）
  vocalBeforeAnalysis: check(false, { label: 'settings.vocalBeforeAnalysis', help: 'settings.vocalBeforeAnalysisHelp' }),
  vocalKeepHighBand: check(false, { label: 'settings.vocalKeepHighBand', help: 'settings.vocalKeepHighBandHelp' }),
  // 抽出の実行環境の wasm のメモリの上限（MB）。iOS は上限の分を予約の枠から差し引くので、抽出できなければ下げる
  vocalMemoryMb: choice<number>(1024, { label: 'settings.vocalMemory', help: 'settings.vocalMemoryHelp', values: MEMORY_MB, format: (mb) => (mb < 1024 ? `${mb} MB` : `${mb / 1024} GB`) }),
  // 楽器ごとに分けるモデル（Demucs。4 つか、ギターとピアノも分ける 6 つ）
  stemModel: choice<StemModel>('htdemucs', {
    label: 'settings.stemModel',
    help: 'settings.stemModelHelp',
    options: [
      ['htdemucs', 'addon.modelStems4'],
      ['htdemucs6s', 'addon.modelStems6'],
    ],
  }),
  // 楽器ごとに分けるとき、ボーカルをさらに主旋律とハモリに分ける（主旋律モデルも使う）
  stemChorus: check(false, { label: 'settings.stemChorus', help: 'settings.stemChorusHelp' }),
})
