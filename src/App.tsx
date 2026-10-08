import MobileEditBar from './components/MobileEditBar'
import { canSaveToFolder } from 'pevenmui/web'
import MarkerTempoDialog from './components/MarkerTempoDialog'
import { segmentAt } from './audio/tempoMap'
import { setExperimentalAlgorithms } from './components/AlgorithmMenu'
import { setOutputDevice } from 'wevocal-lib'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, GlobalStyles, Stack, Snackbar, useColorScheme, useMediaQuery, useTheme } from '@mui/material'
import { desktopStyles, LANDSCAPE_PHONE, usePersistentNumber, ContextMenu, setUiScale, FULL_HEIGHT, PevenLabels, type MenuEntry, WindowModeContext, autoWindowMode, useStableFn, DesktopLayout, MobileLayout } from 'pevenmui'
import LevelMeter from './components/LevelMeter'
import type { Range } from './audio/types'
import { useEditor } from './hooks/useEditor'
import { useDialogs } from './hooks/useDialogs'
import { useSelectionExport } from './hooks/useSelectionExport'
import AppDialogs from './components/AppDialogs'
import { useAppMenus } from './hooks/useAppMenus'
import { useCommandKeys, useCommands } from './commands'
import { useWaveformView, ZOOM_STEP } from 'wevocal-lib/react'
import AppHeader from './components/AppHeader'
import { EmptyState } from './components/EmptyState'
import Waveform, { type DrawPoint } from './components/Waveform'
import type { CurvePoint } from './hooks/useLaneCurve'
import { InspectorFlatContext, SliderResetContext } from './components/inspector/Inspector'
import { useTrackArea } from './components/tracks/useTrackArea'
import RenameDialog from './components/tracks/RenameDialog'
import WaveformToolbar from './components/waveform/WaveformToolbar'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import SelectionField from './components/SelectionField'
import TempoField from './components/TempoField'
import EditPanel from './components/EditPanel'
import VolumePanel from './components/VolumePanel'
import { canRecord } from 'wevocal-lib'
import { flattenPitch } from './audio/pitchTools'
import MobilePlayBar from './components/MobilePlayBar'
import { useAppSettings } from './settings/settings'
import { addonFolder, notifyAddonsChanged } from './addons/addons'
import DebugOverlay from './debug/DebugOverlay'
import UpdatePrompt from './components/UpdatePrompt'
import { countRender } from './debug/debugStats'
import { i18n, LangContext, resolveLang, setLang, t } from './i18n/i18n'
import { setSpliceFadeSec } from './audio/edit'
import { setFastMath, setParallel } from './dsp/engine'
import { app } from './appConfig'
import MoraLane from './components/MoraLane'

/** 操作できないパネルを薄く表示し、触れないようにする */
/** 選択範囲なし（描画のたびに新しい空配列を作らない） */
const NO_SELECTIONS: Range[] = []
const disabledSx =(disabled: boolean) => (disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {})

export default function App() {
  countRender('App')
  const { settings, update: updateSettings } = useAppSettings()
  // Ctrl+Shift+D でデバッグ表示を切り替える
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault()
        updateSettings({ showDebug: !settingsRef.current.showDebug })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [updateSettings])
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // 子の描画より先に言語を切り替えておく（t() は描画中に参照される）
  const lang = resolveLang(settings.language)
  setLang(lang)
  // 継ぎ目のクロスフェード長（言語と同じく、描画中に設定へ合わせておく）
  setSpliceFadeSec(settings.spliceFadeMs / 1000)
  setFastMath(settings.fastMath)
  setParallel(settings.parallelProcess)
  // 画面の大きさ（文字・入力欄・ボタンなどをまとめて拡大縮小する）
  useEffect(() => setUiScale(settings.uiScale), [settings.uiScale])
  // 描画中に合わせる（処理方式のメニューと設定画面が、最初から設定どおりの選択肢になるように。値を入れるだけ）
  setExperimentalAlgorithms(settings.showExperimentalAlgorithms)
  useEffect(() => setOutputDevice(settings.outputDevice), [settings.outputDevice])
  // テンポを解析できたら、BPM と1拍目の位置を設定に入れる（拍の線がそれに合う）
  const ed = useEditor()
  // 追加機能の保存先のフォルダー（試験的）。開いたときに許可がなければ、通知から許可してもらう（Service Worker からは求められない）
  useEffect(() => {
    addonFolder.setEnabled(settings.addonFolder)
    if (!settings.addonFolder) return
    void addonFolder.permission().then((p) => {
      if (p !== 'prompt') return
      const allow = () => void addonFolder.requestPermission().then((ok) => ok && notifyAddonsChanged())
      ed.setToast({ severity: 'info', message: t('addonFolder.permission'), actions: [{ label: t('addonFolder.allow'), onClick: allow }] })
    })
    // 設定を変えたときと、開いたときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.addonFolder])
  // 設定のテーマ（既定 / ライト / ダーク）を反映する
  const { setMode } = useColorScheme()
  useEffect(() => setMode(settings.theme), [settings.theme, setMode])
  const theme = useTheme()
  // 大きめのスマホを横向きにすると幅が md を超えるので、横向きのスマホもスマホの配置にする
  const mobile = useMediaQuery(`${theme.breakpoints.down('md').replace('@media ', '')}, ${LANDSCAPE_PHONE}`)
  const dialogs = useDialogs()
  // マーカーのダイアログを、その id を渡して開く
  const openMarker = (id: 'renameMarker' | 'markerTempo', markerId: string | null | undefined) => markerId && dialogs.open(id, markerId)
  // 自動解析でテンポの変化を見つけたら、採用するか尋ねる
  const tempoChanges = ed.tempo.changes
  useEffect(() => {
    if (tempoChanges) dialogs.open('tempoChange')
  }, [tempoChanges, dialogs])
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  // 目盛りの上で開いたとき（その位置と、そこにあるマーカー）。閉じるアニメーション中に中身が変わらないよう、閉じても残す
  const [rulerAt, setRulerAt] = useState<{ time: number; markerId: string | null } | null>(null)
  // 再生位置の入力を始める合図（目盛りの右クリックメニューから。増やすたびに始まる）
  const [timeEditRequest, setTimeEditRequest] = useState(0)
  // 波形の縦の拡大率（1〜64 倍、2 倍ずつ）。小さい音を見やすくする
  const [waveScale, setWaveScale] = useState(1)
  const stepWaveScale = useStableFn((dir: 1 | -1) => setWaveScale((s) => Math.min(64, Math.max(1, dir > 0 ? s * 2 : s / 2))))
  const [renamingProject, setRenamingProject] = useState(false)
  const { shown, edited, editing, selection, player, playback, loop, busy } = ed
  // 左上のループは通常再生の繰り返しの切り替え（加工欄のループはリアルタイム試聴）
  const toggleRepeat = () => ed.setRepeat(!ed.repeat)
  // 波形の表示範囲はツールバーと波形の両方から操作するため、ここで持つ
  const viewCtl = useWaveformView(ed.duration, player.livePosition, player.playing, settings.followPlayhead, ed.tracks.activeId, settings.wheelZoom)
  const [pitchPercent, setPitchPercent] = usePersistentNumber(app.key('pitchPercent'), 40)
  const { view } = viewCtl
  // 止まっているときに再生位置を動かしたら（矢印キーなど）、画面の外なら見える位置まで表示範囲を動かす
  const { reveal } = viewCtl
  useEffect(() => {
    if (!player.playing) reveal(player.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.position])
  const center = view.start + view.dur / 2
  // トラックの欄（右クリックメニュー・名前の変更を含む）。メニューの「トラック → 名前の変更」からも使う
  // トラックの「⋯」でも同じメニューを開ける（スマホは右クリックができない。位相の反転と EQ もここから）
  const trackArea = useTrackArea(ed, busy, settings.showMeters ? player.analyser : null, dialogs.opener('eq'))

  const selectionExport = useSelectionExport(ed)
  const { dragSelectionFile, saveSelectionToFolder } = selectionExport
  // 操作（コマンド）。メニュー、右クリックは id で参照する（src/commands/、並びは commands/menus.ts）
  const commands = useCommands(
    { ed, dialogs, settings, update: updateSettings, view: { ctl: viewCtl, center, waveScale, setWaveScale }, trackArea, selectionExport },
    ed.keymap,
  )
  const { menus, mobileMenus, context } = useAppMenus(commands)
  // キーボードショートカット（キーの割り当てにある操作は、どれもコマンドで処理する）
  useCommandKeys(commands, ed.keymap)

  // 編集パネルはファイルを開く前から表示しておく（開くまでは操作できない）
  const panelsDisabled = !editing || !edited
  const { showBeatGrid } = settings
  const { bpm: baseBpm } = ed.projectTempo
  const beatGrid = useMemo(() => (showBeatGrid && ed.tempoSegs.length ? { segments: ed.tempoSegs } : null), [showBeatGrid, ed.tempoSegs])
  // 加工やダイアログで使う BPM は、選択範囲（なければ再生位置）の区間のテンポ（テンポが途中で変わる曲）
  const seg = segmentAt(ed.tempoSegs, selection?.start ?? player.position)
  const bpm = seg?.bpm || baseBpm
  const hasCurve = !!ed.pitchTarget.target && ed.pitchTarget.target.hz.some((v) => v > 0)
  const totalDuration = ed.editRanges.reduce((s, r) => s + r.end - r.start, 0)
  const setActiveSelection = (r: Range | null) => ed.setSelections(r ? [...ed.selections.slice(0, -1), r] : [])

  const tempoField = (fontSize?: number) => (
    <TempoField
      bpm={bpm}
      candidates={ed.tempo.candidates}
      analyzing={ed.tempo.analyzing}
      disabled={!shown}
      fontSize={fontSize}
      onChange={(v, offset) => ed.setProjectTempo(offset === undefined ? { bpm: v } : { bpm: v, beatOffset: offset })}
      // 数値を手で入れたときは、設定によっては全体をそのテンポに合わせて伸縮する
      onInput={ed.changeTempo}
      onAnalyze={() =>
        shown &&
        void ed.tempo.analyze(
          shown,
          (c) => ed.setProjectTempo({ bpm: c.bpm, beatOffset: c.offset }),
          (e) => ed.setToast({ severity: 'error', message: t('toast.tempoFailed', { error: String(e) }) }),
        )
      }
    />
  )

  // 波形に渡す関数は作り直さない（波形は memo してあり、スライダーの操作など関係ない変化では描き直さない）
  // ループ試聴・試聴の再生中は、範囲の中ならその中で移る（範囲の外は通常の移動）
  const onWaveSeek = useStableFn((t: number) => (loop.playing && loop.seek(t)) || (ed.preview.player.playing && ed.preview.seekSource(t)) || player.seek(t))
  const onWaveSelections = useStableFn((rs: Range[]) => editing && ed.setSelections(rs))
  const onWaveStretch = useStableFn(ed.stretchRange)
  const onMoveMarker = useStableFn(ed.markers.move)
  const onWaveRetime = useStableFn(ed.retime)
  const onWaveContext = useStableFn((x: number, y: number, ruler?: { time: number; markerId: string | null }) => {
    setRulerAt(ruler ?? null)
    setContextPos({ x, y })
  })
  // 目盛りの上の右クリックメニュー（その位置からの再生・マーカーの追加と、そこにあるマーカーの名前の変更・削除）
  const rulerMenu: MenuEntry[] = rulerAt
    ? [
        { label: t('ruler.playFrom'), onClick: () => playback.playFrom(rulerAt.time) },
        { label: t('ruler.seek'), onClick: () => onWaveSeek(rulerAt.time) },
        // メニューが閉じてフォーカスが戻ったあとに入力欄を出す
        { label: t('time.inputMenu'), onClick: () => setTimeout(() => setTimeEditRequest((n) => n + 1), 100) },
        { divider: true },
        // ここを小節の 1 拍目にする。最初の区間はプロジェクトの 1 拍目の位置、テンポのマーカーの区間はそのマーカーを動かす
        {
          label: t('ruler.beatOne'),
          onClick: () => {
            const s = segmentAt(ed.tempoSegs, rulerAt.time)
            const m = s && Number.isFinite(s.start) ? ed.markers.markers.find((x) => x.tempo && x.time === s.start) : undefined
            if (m) ed.markers.move(m.id, rulerAt.time)
            else ed.setProjectTempo({ beatOffset: rulerAt.time })
          },
        },
        { label: t('marker.add'), onClick: () => ed.markers.add(rulerAt.time) },
        { label: t('marker.rename'), disabled: !rulerAt.markerId, onClick: () => openMarker('renameMarker', rulerAt.markerId) },
        { label: t('marker.tempo'), disabled: !rulerAt.markerId, onClick: () => openMarker('markerTempo', rulerAt.markerId) },
        { label: t('marker.remove'), disabled: !rulerAt.markerId, onClick: () => rulerAt.markerId && ed.markers.remove(rulerAt.markerId) },
      ]
    : []
  const onWaveDraw = useStableFn((from: DrawPoint, to: DrawPoint) => shown && ed.pitch && ed.pitchTarget.draw(shown, ed.pitch, from, to))
  const onWaveGrab = useStableFn((hz: Float32Array) => shown && ed.pitchTarget.replace(shown, hz))
  const onWaveDrawGain = useStableFn((from: CurvePoint, to: CurvePoint) => edited && shown === edited && ed.gainCurve.draw(edited, from, to))
  const onWaveDrawFormant = useStableFn((from: CurvePoint, to: CurvePoint) => edited && shown === edited && ed.formantCurve.draw(edited, from, to))
  const onWaveFocus = useStableFn(ed.setFocusLane)
  const morae = ed.tracks.moraeOf(ed.tracks.activeId)
  const waveform = shown ? (
    <Waveform
      clip={shown}
      position={player.position}
      // ループ試聴・試聴の再生中は、その位置（元の音声の時刻に換算したもの）に線を出す
      playing={player.playing || loop.playing || ed.preview.player.playing}
      livePosition={loop.playing ? loop.livePosition : ed.preview.player.playing ? ed.preview.livePosition : player.livePosition}
      selections={editing ? ed.selections : NO_SELECTIONS}
      // ループ再生中は範囲内ならループの中で移る（範囲外は通常の移動）
      onSeek={onWaveSeek}
      onSelectionsChange={onWaveSelections}
      onStretchRange={onWaveStretch}
      onRetime={onWaveRetime}
      markers={ed.markers.markers}
      waveScale={waveScale}
      onWaveScale={stepWaveScale}
      onRenameMarker={(id) => openMarker('renameMarker', id)}
      onMoveMarker={onMoveMarker}
      onContextMenu={onWaveContext}
      viewCtl={viewCtl}
      pitch={ed.pitch}
      showPitch={ed.showPitch}
      touchHandles={mobile && settings.mobileUi === 'new'}
      touchPan={mobile && settings.mobileUi === 'new' && settings.touchSelect === 'longPress'}
      target={ed.pitchTarget.target?.clip === shown ? ed.pitchTarget.target.hz : null}
      penMode={ed.penMode && editing}
      onDraw={onWaveDraw}
      grabMode={ed.grabMode && editing}
      onGrabPitch={onWaveGrab}
      spectrogram={ed.spec}
      showSpectrogram={ed.showSpec}
      pitchPercent={pitchPercent}
      onPitchPercentChange={setPitchPercent}
      beatGrid={beatGrid}
      ghosts={editing ? ed.tracks.ghosts : undefined}
      showWave={ed.showWave}
      showGain={ed.showGain}
      gainCurve={ed.gainCurve.curve?.clip === shown ? ed.gainCurve.curve.values : null}
      onDrawGain={onWaveDrawGain}
      showFormant={ed.showFormant}
      formantCurve={ed.formantCurve.curve?.clip === shown ? ed.formantCurve.curve.values : null}
      onDrawFormant={onWaveDrawFormant}
      focusLane={ed.focusLane}
      onFocusLane={onWaveFocus}
    />
  ) : (
    <EmptyState onOpen={ed.picker.open} onSynth={dialogs.opener('synth')} onRecord={canRecord() ? dialogs.opener('record') : undefined} recent={ed.recent} />
  )
  // トラックが2本以上あるときだけ、波形の上にトラックの欄を出す（広げると波形付きの一覧、折りたたむとタブ）
  const editor = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {trackArea.panel(view)}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{waveform}</Box>
      {/* 読みの帯（一音ずつ切り出した範囲。加工後の音声を表示しているときだけ） */}
      {shown && shown === ed.edited && morae.length > 0 && (
        <MoraLane morae={morae} view={view} onChange={(list) => ed.tracks.setMorae(ed.tracks.activeId, list)} onPlay={(m) => ed.playback.playRange(m.start, m.end)} />
      )}
    </Box>
  )

  const viewTools = (
    <WaveformToolbar
      disabled={!shown}
      zoomed={viewCtl.zoomed}
      canZoomIn={viewCtl.canZoomIn}
      wheelZoom={settings.wheelZoom}
      onZoomOut={() => viewCtl.zoomAround(1 / ZOOM_STEP, center)}
      onZoomIn={() => viewCtl.zoomAround(ZOOM_STEP, selection ? (selection.start + selection.end) / 2 : center)}
      onShowAll={viewCtl.showAll}
      follow={settings.followPlayhead}
      onFollowChange={(v) => updateSettings({ followPlayhead: v })}
      showSpectrogram={ed.showSpec}
      onShowSpectrogramChange={ed.setShowSpec}
      spectrogramAvailable={ed.analyzerInstalled}
      showPitch={ed.showPitch}
      onShowPitchChange={ed.setShowPitch}
      showWave={ed.showWave}
      onShowWaveChange={ed.setShowWave}
      // ピッチを波形に重ねているときは、波形の帯がピッチの帯も兼ねるので、波形にフォーカスしていてもピッチの道具を出す
      pitchFocused={ed.focusLane === 'pitch' || (settings.overlayPitch && ed.showWave && ed.showPitch && ed.focusLane === 'wave')}
      showGain={ed.showGain}
      onShowGainChange={ed.setShowGain}
      gainFocused={ed.focusLane === 'gain'}
      hasGainCurve={!!ed.gainCurve.curve && ed.gainCurve.curve.clip === edited}
      onApplyGain={ed.applyGain}
      onClearGain={ed.gainCurve.clear}
      formant={{
        show: ed.showFormant,
        onShowChange: ed.setShowFormant,
        focused: ed.focusLane === 'formant',
        hasCurve: !!ed.formantCurve.curve && ed.formantCurve.curve.clip === edited,
        previewPlaying: ed.formantCurve.preview.playing,
        previewBusy: ed.formantCurve.preview.busy,
        onPreview: () => void ed.formantCurve.preview.toggle(),
        onApply: ed.applyFormant,
        onClear: ed.formantCurve.clear,
      }}
      penMode={ed.penMode}
      onPenModeChange={ed.setPenMode}
      grabMode={ed.grabMode}
      onGrabModeChange={ed.setGrabMode}
      hasCurve={hasCurve}
      busy={busy}
      onApplyCurve={ed.applyCurve}
      onClearCurve={ed.pitchTarget.clear}
      pitchReady={ed.pitchTools.ready && editing}
      onShift={ed.pitchTools.shift}
      curvePreviewPlaying={ed.pitchTools.preview.playing}
      curvePreviewBusy={ed.pitchTools.preview.busy}
      onCurvePreview={() => void ed.pitchTools.preview.toggle()}
      onFlatten={() => ed.pitchTools.edit((tg, f0, k0, k1) => flattenPitch(tg, f0, k0, k1, settings.flattenStrength))}
      onSnap={() => dialogs.open('pitchTool', 'snap')}
      onVibrato={() => dialogs.open('pitchTool', 'vibrato')}
      onMidi={() => dialogs.open('pitchTool', 'midi')}
    />
  )

  const editPanel = (
    <Box sx={disabledSx(panelsDisabled)} aria-disabled={panelsDisabled}>
      <EditPanel
        params={ed.params}
        onChange={ed.setParams}
        targetDuration={totalDuration}
        hasSelection={!!selection}
        busy={busy || panelsDisabled}
        progress={ed.progress}
        onApply={ed.apply}
        preview={ed.multi ? 'multi' : ed.preview.state}
        previewPlaying={ed.preview.player.playing}
        onPreview={playback.togglePreview}
        loopPlaying={loop.playing}
        onLoop={playback.toggleLoop}
        currentMidi={ed.rangeNote}
        autoMode={ed.autoMode}
        modes={ed.modes}
        showLegacyAlgorithms={settings.showLegacyAlgorithms}
        bpm={bpm}
        rangeSec={selection ? selection.end - selection.start : ed.duration}
        presets={settings.presets}
        onPresetsChange={(presets) => updateSettings({ presets })}
      />
    </Box>
  )
  const volumePanel = (
    <Box sx={disabledSx(panelsDisabled)} aria-disabled={panelsDisabled}>
      <VolumePanel
        hasSelection={!!selection}
        busy={busy || panelsDisabled}
        fader={ed.tracks.faderOf(ed.tracks.activeId)}
        onFaderChange={(patch) => ed.tracks.setFader(ed.tracks.activeId, patch)}
        db={ed.gainDb}
        onDbChange={ed.setGainDb}
        pan={ed.pan}
        onPanChange={ed.setPan}
        onGain={ed.cmd.gain}
        onAction={ed.cmd.volume}
      />
    </Box>
  )

  return (
    <LangContext.Provider value={lang}>
      <PevenLabels.Provider value={i18n.labels(lang)}>
      <WindowModeContext.Provider value={settings.dialogWindow === 'auto' ? autoWindowMode() : settings.dialogWindow}>
      <SliderResetContext.Provider value={settings.sliderDoubleClickReset}>
      {!mobile && <GlobalStyles styles={desktopStyles} />}
      {/* アプリとして画面の高さにぴったり収め、ページ全体はスクロールさせない */}
      <Box sx={{ height: FULL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
        <AppHeader
          menus={mobile ? mobileMenus : menus}
          canUndo={ed.history.canUndo}
          canRedo={ed.history.canRedo}
          busy={busy}
          onUndo={ed.history.undo}
          onRedo={ed.history.redo}
          projectName={ed.fileName}
          dirty={ed.dirty}
        />
        {ed.picker.input}
        {ed.addPicker.input}
        {mobile ? (
          <MobileLayout
            editor={editor}
            editorFooter={
              <>
              {/* 新しいスマホの画面: 範囲を選んだら、波形の下に編集のボタンを出す（memo/mobile-ui.md の 4.1） */}
              {settings.mobileUi === 'new' && editing && ed.selections.length > 0 && (
                <MobileEditBar
                  playSelection={playback.playSelection}
                  cut={ed.clip.cut}
                  copy={ed.clip.copy}
                  paste={ed.clip.paste}
                  canPaste={ed.clip.hasClipboard}
                  remove={ed.clip.remove}
                  toNewTrack={() => ed.tracks.fromSelection(ed.selections, false)}
                  more={(x, y) => onWaveContext(x, y)}
                />
              )}
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <SelectionField
                  duration={ed.duration}
                  selection={selection}
                  selectionCount={ed.selections.length}
                  bpm={bpm}
                  onSelectionChange={setActiveSelection}
                  disabled={!editing}
                  fontSize={13}
                />
                {tempoField(13)}
              </Stack>
              </>
            }
            // タブで切り替えているので、中の区切りの見出し（たたむもの）は出さない
            tabs={[
              { key: 'process', label: t('process.title'), content: <InspectorFlatContext.Provider value>{editPanel}</InspectorFlatContext.Provider> },
              { key: 'volume', label: t('volume.title'), content: <InspectorFlatContext.Provider value>{volumePanel}</InspectorFlatContext.Provider> },
            ]}
            collapsible={settings.mobileUi === 'new'}
            storageKey={app.key('mobilePanelPinned')}
            openLabel={t('mobilePanel.open')}
            view={viewTools}
            playBar={
              <MobilePlayBar
                playing={player.playing}
                position={player.position}
                livePosition={player.livePosition}
                onSeek={onWaveSeek}
                timeEditRequest={timeEditRequest}
                duration={ed.duration}
                hasSelection={!!selection}
                loopPlaying={ed.repeat}
                onTogglePlay={playback.togglePlay}
                onStop={playback.stop}
                onPlaySelection={playback.playSelection}
                onLoop={toggleRepeat}
                meter={settings.showMeters && <LevelMeter source={player.masterAnalysers} rows={2} width={96} height={7} label={t('meter.master')} />}
              />
            }
          />
        ) : (
          <DesktopLayout
            storageKey={app.key('inspectorWidth')}
            toolbar={
              <Toolbar
                playing={player.playing}
                position={player.position}
                livePosition={player.livePosition}
                onSeek={onWaveSeek}
                timeEditRequest={timeEditRequest}
                duration={ed.duration}
                hasSelection={!!selection}
                loopPlaying={ed.repeat}
                disabled={!shown}
                onTogglePlay={playback.togglePlay}
                onStop={playback.stop}
                onPlaySelection={playback.playSelection}
                onLoop={toggleRepeat}
                meter={settings.showMeters && <LevelMeter source={player.masterAnalysers} rows={2} width={80} height={9} label={t('meter.master')} />}
                viewTools={viewTools}
                canEdit={editing && !busy}
                hasClipboard={ed.clip.hasClipboard}
                canTrim={ed.clip.canTrim}
                onCut={ed.clip.cut}
                onCopy={ed.clip.copy}
                onPaste={ed.clip.paste}
                onTrim={ed.clip.trim}
                onClearSelection={ed.clearSelection}
              />
            }
            editor={editor}
            inspector={
              <>
                {editPanel}
                {volumePanel}
              </>
            }
            statusBar={
              <StatusBar
                fileName={ed.fileName}
                dirty={ed.dirty}
                onRename={() => setRenamingProject(true)}
                clip={shown}
                duration={ed.duration}
                selection={selection}
                selectionCount={ed.selections.length}
                bpm={bpm}
                dragFile={settings.showMaterialButton ? dragSelectionFile : undefined}
                onQuickSave={settings.showMaterialButton && canSaveToFolder() ? () => void saveSelectionToFolder() : undefined}
                onSelectionChange={setActiveSelection}
                source={ed.source}
                onSourceChange={ed.setSource}
                showSource={settings.keepOriginal}
                tempo={tempoField()}
              />
            }
          />
        )}
      </Box>

      <ContextMenu position={contextPos} entries={rulerAt ? rulerMenu : context} onClose={() => setContextPos(null)} />
      {trackArea.overlays}
      <RenameDialog
        name={renamingProject ? ed.fileName : null}
        title={t('project.rename')}
        onClose={() => setRenamingProject(false)}
        onRename={ed.setProjectName}
      />
      <RenameDialog
        name={ed.markers.markers.find((m) => m.id === dialogs.arg<string>('renameMarker'))?.name ?? null}
        title={t('marker.rename')}
        onClose={dialogs.closer('renameMarker')}
        onRename={(name) => { const id = dialogs.arg<string>('renameMarker'); if (id) ed.markers.rename(id, name) }}
      />
      {(() => {
        const m = ed.markers.markers.find((x) => x.id === dialogs.arg<string>('markerTempo')) ?? null
        // 初期値は、マーカーの直前のテンポ
        const before = m ? segmentAt(ed.tempoSegs, m.time - 1e-6) : undefined
        return (
          <MarkerTempoDialog
            marker={m}
            current={{ bpm: before?.bpm ?? baseBpm, beatsPerBar: before?.beatsPerBar ?? ed.projectTempo.beatsPerBar }}
            onClose={dialogs.closer('markerTempo')}
            onChange={(tempo) => m && ed.markers.setTempo(m.id, tempo)}
          />
        )
      })()}
      <AppDialogs ed={ed} dialogs={dialogs} bpm={bpm} seg={seg} selectionExport={selectionExport} />
      {settings.showDebug && <DebugOverlay />}
      <UpdatePrompt devUpdates={settings.devUpdates} />
      {ed.addonDialog}
      {ed.extractDialog}

      {/* ボタンのある通知は、押す間があるよう長めに出す */}
      {/* スマホは下の再生バーを隠さないよう、通知を上に出す */}
      <Snackbar anchorOrigin={mobile ? { vertical: 'top', horizontal: 'center' } : undefined} open={!!ed.toast} autoHideDuration={ed.toast?.actions ? 10000 : 4000} onClose={() => ed.setToast(null)}>
        {ed.toast ? (
          <Alert
            severity={ed.toast.severity}
            variant="filled"
            onClose={() => ed.setToast(null)}
            action={
              ed.toast.actions && (
                <>
                  {ed.toast.actions.map((a) => (
                    <Button key={a.label} color="inherit" size="small" onClick={() => (ed.setToast(null), a.onClick())}>
                      {a.label}
                    </Button>
                  ))}
                </>
              )
            }
          >
            {ed.toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
      </SliderResetContext.Provider>
      </WindowModeContext.Provider>
      </PevenLabels.Provider>
    </LangContext.Provider>
  )
}
