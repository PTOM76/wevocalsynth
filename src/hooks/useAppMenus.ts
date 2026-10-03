import type { MenuEntry, MenuGroup } from 'pevenmui'
import { useT } from '../i18n/i18n'
import { openExternal, USER_GUIDE_URL } from '../links'
import type { WheelZoom } from '../settings/settings'

interface Actions {
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
  openExport: () => void
  undo: () => void
  redo: () => void
  cut: () => void
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
  /** トラックの複製と、ファイルをトラックとして追加 */
  duplicateTrack: () => void
  /** 原音を新しいトラックに（原音が加工後と違うときだけ） */
  hasOriginal: boolean
  trackFromOriginal: () => void
  addEmptyTrack: () => void
  /** 無音の挿入（長さを決めるダイアログを開く） */
  insertSilence: () => void
  /** 選択範囲を同じ位置のまま新しいトラックへ（`move` なら元は無音に） */
  selectionToTrack: (move: boolean) => void
  addTrack: () => void
  /** 音を0から作る（新しいトラック。何も開いていなくても使える） */
  synth: () => void
  /** 選択範囲を MIDI の音符に並べる */
  sampler: () => void
  /** プロジェクト名を変える */
  showShortcuts: () => void
  showSettings: () => void
  showHistory: () => void
  showAbout: () => void
  /** Ctrl+S をどちらに割り当てているか（メニューの表記用） */
  ctrlS: 'project' | 'export'
  // ---- 再生 ----
  playing: boolean
  togglePlay: () => void
  stop: () => void
  seekEdge: (edge: 'start' | 'end') => void
  /** ループ再生（通常再生の繰り返し）がオンか */
  repeat: boolean
  // ---- 表示 ----
  canZoomIn: boolean
  /** ホイールだけで拡大縮小する設定か（メニューのショートカット表記を変える） */
  wheelZoom: WheelZoom
  zoomed: boolean
  zoomIn: () => void
  zoomOut: () => void
  showAll: () => void
  follow: boolean
  toggleFollow: () => void
  showMeters: boolean
  showNotes: boolean
  toggleNotes: () => void
  showPitchLine: boolean
  /** 波形の縦の拡大率 */
  waveScale: number
  stepWaveScale: (dir: 1 | -1) => void
  resetWaveScale: () => void
  togglePitchLine: () => void
  toggleMeters: () => void
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
  // ---- マーカー ----
  hasMarkers: boolean
  /** 再生位置か、その前にマーカーがあるか（名前の変更・削除の対象） */
  hasCurrentMarker: boolean
  addMarker: () => void
  renameMarker: () => void
  removeMarker: () => void
  clearMarkers: () => void
  seekMarker: (dir: -1 | 1) => void
  /** 新しい版を確認する（ヘルプ） */
  checkUpdate: () => void
  /** ライセンス情報を出す */
  showLicenses: () => void
}

/** メニューバー（スマホではメニュー一覧）と、波形の右クリックメニューの中身 */
export function useAppMenus(a: Actions): { menus: MenuGroup[]; mobileMenus: MenuGroup[]; context: MenuEntry[] } {
  const t = useT()
  const noClip = !a.hasClip || a.busy
  const noSel = noClip || !a.hasSelection
  // ピッチの強制表示・非表示は、ピッチを表示して解析が済んでから
  const noVoicing = noSel || !a.pitchReady
  const edit: MenuEntry[] = [
    { label: t('edit.cut'), shortcut: 'Ctrl+X', disabled: noSel, onClick: a.cut },
    { label: t('edit.copy'), shortcut: 'Ctrl+C', disabled: noSel, onClick: a.copy },
    { label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: noClip || !a.hasClipboard, onClick: a.paste },
    { label: t('edit.trim'), disabled: noSel || !a.canTrim, onClick: a.trim },
    { label: t('edit.reverse'), disabled: noClip, onClick: a.reverse },
    { label: t('silence.menu'), disabled: noClip, onClick: a.insertSilence },
    {
      label: t('menu.toNewTrack'),
      disabled: noSel,
      submenu: [
        { label: t('track.copySelection'), onClick: () => a.selectionToTrack(false) },
        { label: t('track.moveSelection'), onClick: () => a.selectionToTrack(true) },
      ],
    },
    { divider: true },
    { label: t('edit.selectAll'), shortcut: 'Ctrl+A', disabled: noClip, onClick: a.selectAll },
    { label: t('soundSelect.menu'), disabled: noClip, onClick: a.selectSounds },
    { label: t('edit.clearSelection'), shortcut: 'Esc', disabled: noSel, onClick: a.clearSelection },
  ]
  // ボーカル抽出（選択範囲、なければ全体）。メニューバーでは「ツール」、右クリックメニューでは編集の後ろに出す
  const extract: MenuEntry[] = [
    { label: t('extract.vocalsMenu'), disabled: noClip, onClick: () => a.extract('vocals') },
    { label: t('extract.accompanimentMenu'), disabled: noClip, onClick: () => a.extract('accompaniment') },
    { label: t('extract.splitMenu'), disabled: noClip, onClick: a.splitStems },
  ]
  // 編集メニューに入れすぎないよう、加工の道具（抽出・音声の作成）は「ツール」にまとめる
  const tools: MenuEntry[] = [
    ...extract,
    { divider: true },
    { label: t('sampler.menu'), disabled: noClip, onClick: a.sampler },
    { label: t('synth.menu'), disabled: a.busy, onClick: a.synth },
  ]
  // 最近使用したファイル（File System Access API が使えるブラウザでだけ出す）
  const recentMenu: MenuEntry[] = !a.recent.supported
    ? []
    : [
        {
          label: t('menu.recent'),
          disabled: a.busy,
          submenu: a.recent.names.length
            ? [
                ...a.recent.names.map((name, i): MenuEntry => ({ label: name, onClick: () => a.recent.open(i) })),
                { divider: true },
                { label: t('menu.recentClear'), onClick: a.recent.clear },
              ]
            : [{ label: t('menu.recentEmpty'), disabled: true, onClick: () => {} }],
        },
      ]

  const menus: MenuGroup[] = [
    {
      label: t('menu.file'),
      accessKey: 'F',
      entries: [
        { label: t('menu.open'), shortcut: 'Ctrl+O', disabled: a.busy, onClick: a.open },
        ...recentMenu,
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('menu.saveProject'), shortcut: a.ctrlS === 'project' ? 'Ctrl+S' : 'Ctrl+Shift+S', disabled: noClip, onClick: a.save },
        { divider: true },
        { label: t('menu.export'), shortcut: a.ctrlS === 'export' ? 'Ctrl+S' : 'Ctrl+Shift+S', disabled: noClip, onClick: a.openExport },
        { divider: true },
        { label: t('menu.settings'), onClick: a.showSettings },
      ],
    },
    {
      label: t('menu.edit'),
      accessKey: 'E',
      entries: [
        { label: t('common.undo'), shortcut: 'Ctrl+Z', disabled: !a.canUndo || a.busy, onClick: a.undo },
        { label: t('common.redo'), shortcut: 'Ctrl+Y', disabled: !a.canRedo || a.busy, onClick: a.redo },
        { label: t('history.menu'), disabled: noClip, onClick: a.showHistory },
        { divider: true },
        ...edit,
        { divider: true },
        {
          label: t('menu.marker'),
          disabled: !a.hasClip,
          submenu: [
            { label: t('marker.add'), shortcut: 'M', onClick: a.addMarker },
            { label: t('marker.rename'), disabled: !a.hasCurrentMarker, onClick: a.renameMarker },
            { label: t('marker.remove'), disabled: !a.hasCurrentMarker, onClick: a.removeMarker },
            { label: t('marker.clear'), disabled: !a.hasMarkers, onClick: a.clearMarkers },
          ],
        },
        // 音量の編集（今は音量の欄にもある）
        {
          label: t('volume.title'),
          disabled: noClip,
          submenu: [
            { label: t('volume.fadeIn'), onClick: () => a.volumeAction('fadeIn') },
            { label: t('volume.fadeOut'), onClick: () => a.volumeAction('fadeOut') },
            { label: t('volume.normalize'), onClick: () => a.volumeAction('normalize') },
            { label: t('volume.silence'), onClick: () => a.volumeAction('silence') },
          ],
        },
      ],
    },
    {
      label: t('menu.view'),
      accessKey: 'V',
      entries: [
        { label: t('menu.spectrogram'), checked: a.showSpectrogram, disabled: !a.hasClip, onClick: a.toggleSpectrogram },
        { label: t('menu.wave'), checked: a.showWave, disabled: !a.hasClip || (a.showWave && !a.showPitch && !a.showSpectrogram && !a.showGain && !a.showFormant), onClick: a.toggleWave },
        { label: t('menu.pitch'), checked: a.showPitch, disabled: !a.hasClip, onClick: a.togglePitch },
        { label: t('menu.gain'), checked: a.showGain, disabled: !a.hasClip, onClick: a.toggleGain },
        { label: t('menu.formant'), checked: a.showFormant, disabled: !a.hasClip, onClick: a.toggleFormant },
        { divider: true },
        // ピッチの線と音符は、どちらか一方は残す
        { label: t('menu.pitchLine'), checked: a.showPitchLine || !a.showNotes, disabled: !a.hasClip || !a.showPitch || !a.showNotes, onClick: a.togglePitchLine },
        { label: t('menu.notes'), checked: a.showNotes, disabled: !a.hasClip || !a.showPitch || (a.showNotes && !a.showPitchLine), onClick: a.toggleNotes },
        { divider: true },
        { label: t('wave.zoomIn'), shortcut: a.wheelZoom === 'wheel' ? 'Wheel' : 'Ctrl+Wheel', disabled: !a.hasClip || !a.canZoomIn, onClick: a.zoomIn },
        { label: t('wave.zoomOut'), disabled: !a.hasClip || !a.zoomed, onClick: a.zoomOut },
        { label: t('wave.showAll'), disabled: !a.hasClip || !a.zoomed, onClick: a.showAll },
        {
          label: t('wave.vZoom'),
          disabled: !a.hasClip,
          submenu: [
            { label: t('wave.vZoomIn'), shortcut: 'Alt+Wheel', disabled: a.waveScale >= 64, onClick: () => a.stepWaveScale(1) },
            { label: t('wave.vZoomOut'), disabled: a.waveScale <= 1, onClick: () => a.stepWaveScale(-1) },
            { label: t('wave.vZoomReset'), disabled: a.waveScale === 1, onClick: a.resetWaveScale },
          ],
        },
        { label: t('wave.follow'), checked: a.follow, onClick: a.toggleFollow },
        { divider: true },
        { label: t('settings.showMeters'), checked: a.showMeters, onClick: a.toggleMeters },
      ],
    },
    {
      label: t('menu.play'),
      accessKey: 'P',
      entries: [
        { label: t(a.playing ? 'play.pause' : 'play.play'), shortcut: 'Space', disabled: !a.hasClip, onClick: a.togglePlay },
        { label: t('common.stop'), disabled: !a.hasClip, onClick: a.stop },
        { label: t('play.playSelection'), disabled: noSel, onClick: a.playSelection },
        { label: t('play.repeat'), checked: a.repeat, disabled: !a.hasClip, onClick: a.toggleLoop },
        { divider: true },
        { label: t('play.toStart'), shortcut: 'Home', disabled: !a.hasClip, onClick: () => a.seekEdge('start') },
        { label: t('play.toEnd'), shortcut: 'End', disabled: !a.hasClip, onClick: () => a.seekEdge('end') },
        { label: t('marker.prev'), shortcut: 'Ctrl+←', disabled: !a.hasMarkers, onClick: () => a.seekMarker(-1) },
        { label: t('marker.next'), shortcut: 'Ctrl+→', disabled: !a.hasMarkers, onClick: () => a.seekMarker(1) },
      ],
    },
    {
      label: t('menu.track'),
      accessKey: 'R',
      entries: [
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('track.duplicate'), disabled: noClip, onClick: a.duplicateTrack },
        { label: t('track.fromOriginalMenu'), disabled: noClip || !a.hasOriginal, onClick: a.trackFromOriginal },
        { label: t('track.addEmpty'), disabled: noClip, onClick: a.addEmptyTrack },
        { label: t('track.copySelection'), disabled: noSel, onClick: () => a.selectionToTrack(false) },
        { label: t('track.moveSelection'), disabled: noSel, onClick: () => a.selectionToTrack(true) },
        { label: t('track.rename'), disabled: noClip, onClick: a.renameTrack },
        { label: t('track.remove'), disabled: noClip || a.trackCount < 2, onClick: a.removeTrack },
        { divider: true },
        // ミュート・ソロ・位相反転は2本以上のときだけ（1本では意味がなく、自動で解除する）
        { label: t('track.mute'), checked: a.activeMute, disabled: noClip || a.trackCount < 2, onClick: a.toggleMute },
        { label: t('track.solo'), checked: a.activeSolo, disabled: noClip || a.trackCount < 2, onClick: a.toggleSolo },
        { label: t('track.invert'), checked: a.activeInvert, disabled: noClip || a.trackCount < 2, onClick: a.toggleInvert },
        { divider: true },
        { label: t('track.mergeDown'), disabled: noClip || !a.canMergeDown, onClick: a.mergeDown },
        { label: t('track.mergeAll'), disabled: noClip || a.trackCount < 2, onClick: a.mergeAll },
      ],
    },
    { label: t('menu.tools'), accessKey: 'T', entries: tools },
    {
      label: t('menu.help'),
      accessKey: 'H',
      entries: [
        { label: t('menu.userGuide'), onClick: () => openExternal(USER_GUIDE_URL) },
        { label: t('menu.shortcuts'), onClick: a.showShortcuts },
        { divider: true },
        { label: t('menu.checkUpdate'), onClick: a.checkUpdate },
        { label: t('menu.licenses'), onClick: a.showLicenses },
        { label: t('menu.about'), onClick: a.showAbout },
      ],
    },
  ]

  const context: MenuEntry[] = [
    { label: t('play.playSelection'), disabled: noSel, onClick: a.playSelection },
    { label: t('play.repeat'), disabled: noClip, onClick: a.toggleLoop },
    { divider: true },
    ...edit,
    { divider: true },
    ...extract,
    { divider: true },
    { label: t('track.duplicate'), disabled: noClip, onClick: a.duplicateTrack },
    ...(a.pitchLane
      ? [
          { divider: true as const },
          { label: t('voicing.force'), disabled: noVoicing, onClick: () => a.setVoicing(1) },
          { label: t('voicing.mute'), disabled: noVoicing, onClick: () => a.setVoicing(-1) },
          { label: t('voicing.reset'), disabled: noVoicing, onClick: () => a.setVoicing(0) },
        ]
      : []),
  ]

  // スマホの ⋮ は短くする。切り取りなどは長押しメニュー、元に戻すは上部バー、
  // 表示の切替は波形の下にあるので入れない。キーボードがないのでショートカット一覧も出さない
  const mobileMenus: MenuGroup[] = [
    {
      label: t('menu.file'),
      entries: [
        { label: t('menu.open'), disabled: a.busy, onClick: a.open },
        ...recentMenu,
        { label: t('track.addMenu'), disabled: noClip, onClick: a.addTrack },
        { label: t('menu.saveProject'), disabled: noClip, onClick: a.save },
        { label: t('menu.export'), disabled: noClip, onClick: a.openExport },
      ],
    },
    {
      label: t('menu.edit'),
      entries: [
        { label: t('edit.selectAll'), disabled: noClip, onClick: a.selectAll },
        { label: t('soundSelect.menu'), disabled: noClip, onClick: a.selectSounds },
        { label: t('edit.clearSelection'), disabled: noSel, onClick: a.clearSelection },
        { label: t('history.menu'), disabled: noClip, onClick: a.showHistory },
      ],
    },
    { label: t('menu.tools'), entries: tools },
    {
      label: t('menu.help'),
      entries: [
        { label: t('menu.settings'), onClick: a.showSettings },
        { label: t('menu.userGuide'), onClick: () => openExternal(USER_GUIDE_URL) },
        { label: t('menu.checkUpdate'), onClick: a.checkUpdate },
        { label: t('menu.licenses'), onClick: a.showLicenses },
        { label: t('menu.about'), onClick: a.showAbout },
      ],
    },
  ]

  return { menus, mobileMenus, context }
}
