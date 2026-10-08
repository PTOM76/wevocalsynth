import type { Keymap } from '../../settings/keymap'

/** メニューが使う状態と操作（App から渡す。設定から読めるものは入れない） */

export interface MenuActions {
  /** キーの割り当て（メニューの右に出すキー） */
  keymap: Keymap
  hasClip: boolean
  hasSelection: boolean
  hasClipboard: boolean
  /** 選択範囲のみ残すを使えるか（ピッチの帯にフォーカスしているときは使えない） */
  canTrim: boolean
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  showSpectrogram: boolean
  showPitch: boolean
  open: () => void
  /** 最近使用したファイル（名前の一覧・開く・一覧を消す） */
  recent: { supported: boolean; names: string[]; open: (i: number) => void; clear: () => void }
  save: () => void
  saveAs: () => void
  openExport: () => void
  /** 動画として書き出す（追加機能「変換」） */
  openVideoExport: () => void
  /** 追加機能「変換」を導入しているか（していなければ「動画として書き出す…」を出さない） */
  videoAvailable: boolean
  /** 選択範囲を書き出し先のフォルダーへ保存する（使えなければ undefined） */
  saveToFolder?: () => void
  /** 選択範囲が 2 つ以上のとき、別々のファイルにして保存する */
  saveManyToFolder?: () => void
  selectionCount: number
  undo: () => void
  redo: () => void
  cut: () => void
  /** 選択範囲を取り除く（クリップボードに入れない） */
  remove: () => void
  copy: () => void
  paste: () => void
  trim: () => void
  /** 選択範囲（なければ全体）を逆再生にする */
  reverse: () => void
  clearSelection: () => void
  selectAll: () => void
  /** 無音で区切って選択（ダイアログを出す） */
  selectSounds: () => void
  playSelection: () => void
  toggleLoop: () => void
  toggleSpectrogram: () => void
  togglePitch: () => void
  /** 波形の帯を出すか（ピッチを出していないときは隠せない） */
  showWave: boolean
  toggleWave: () => void
  showGain: boolean
  toggleGain: () => void
  showFormant: boolean
  toggleFormant: () => void
  /** ピッチを表示していて解析済みか */
  pitchReady: boolean
  /** 選択範囲のピッチを強制表示（1）・強制非表示（-1）・解析のまま（0）にする */
  setVoicing: (value: 1 | -1 | 0) => void
  /** 右クリックした帯がピッチの帯か（ピッチの強制表示などはそのときだけ出す） */
  pitchLane: boolean
  /** ボーカル抽出（追加機能）。対象は選択範囲、なければ全体 */
  extract: (stem: 'vocals' | 'accompaniment') => void
  /** 選んでいるトラックを、ボーカルと伴奏の2トラックに分ける */
  splitStems: () => void
  splitLeadStems: () => void
  /** 和音を 2 つの声に分ける（試作。設定の開発者向けでオンのときだけ渡す） */
  splitVoices?: (by: 'pitch' | 'volume') => void
  /** 声の素材から一音を作る（試験的）の試し。設定で ON のときだけ */
  kanaDemo?: (vowel: number) => void
  /** トラックの複製と、ファイルをトラックとして追加 */
  duplicateTrack: () => void
  /** 原音を新しいトラックに（原音が加工後と違うときだけ） */
  hasOriginal: boolean
  trackFromOriginal: () => void
  addEmptyTrack: () => void
  /** 無音の挿入（長さを決めるダイアログを開く） */
  insertSilence: () => void
  /** 選択範囲を繰り返す（回数を決めるダイアログを開く） */
  repeatSelection: () => void
  /** 選択範囲を同じ位置のまま新しいトラックへ（`move` なら元は無音に） */
  selectionToTrack: (move: boolean) => void
  addTrack: () => void
  /** 録音のダイアログを開く（録音できないブラウザでは渡さない） */
  record?: () => void
  /** 音を0から作る（新しいトラック。何も開いていなくても使える） */
  synth: () => void
  /** 選択範囲を MIDI の音符に並べる */
  sampler: () => void
  /** プロジェクト名を変える */
  showShortcuts: () => void
  showSettings: () => void
  showHistory: () => void
  showAbout: () => void
  // ---- 再生 ----
  playing: boolean
  togglePlay: () => void
  stop: () => void
  seekEdge: (edge: 'start' | 'end') => void
  /** ループ再生（通常再生の繰り返し）がオンか */
  repeat: boolean
  // ---- 表示 ----
  canZoomIn: boolean
  zoomed: boolean
  zoomIn: () => void
  zoomOut: () => void
  showAll: () => void
  /** 選択範囲に合わせて拡大する */
  zoomSelection: () => void
  /** 波形の縦の拡大率 */
  waveScale: number
  stepWaveScale: (dir: 1 | -1) => void
  resetWaveScale: () => void
  // ---- トラック（選んでいるトラックに効く） ----
  trackCount: number
  /** 選んでいるトラックのミュート・ソロ・位相反転 */
  activeMute: boolean
  activeSolo: boolean
  activeInvert: boolean
  toggleMute: () => void
  toggleSolo: () => void
  toggleInvert: () => void
  renameTrack: () => void
  removeTrack: () => void
  /** すぐ下にトラックがあるか（すぐ下と統合を使えるか） */
  canMergeDown: boolean
  mergeDown: () => void
  mergeAll: () => void
  // ---- 音量の編集（選択範囲、なければ全体） ----
  volumeAction: (action: 'fadeIn' | 'fadeOut' | 'normalize' | 'silence') => void
  // ---- ピッチの道具（選択範囲、なければ全体。右クリックではピッチの帯のときだけ） ----
  pitchTool: { shift: (dir: 1 | -1) => void; flatten: () => void; snap: () => void; vibrato: () => void; midi: () => void }
  // ---- マーカー ----
  hasMarkers: boolean
  /** 再生位置か、その前にマーカーがあるか（名前の変更・削除の対象） */
  hasCurrentMarker: boolean
  addMarker: () => void
  renameMarker: () => void
  markerTempo: () => void
  removeMarker: () => void
  clearMarkers: () => void
  seekMarker: (dir: -1 | 1) => void
  /** 新しい版を確認する（ヘルプ） */
  checkUpdate: () => void
  /** ライセンス情報を出す */
  showLicenses: () => void
}
