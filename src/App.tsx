import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, GlobalStyles, Stack, Snackbar, useColorScheme, useMediaQuery, useTheme } from '@mui/material'
import { desktopStyles, LANDSCAPE_PHONE, usePersistentNumber, ContextMenu, PevenLabels, jaLabels, enLabels, WindowModeContext, autoWindowMode } from 'pevenmui'
import type { Range } from './audio/types'
import { useEditor } from './hooks/useEditor'
import { useAppMenus } from './hooks/useAppMenus'
import { useWaveformView, ZOOM_STEP } from './components/waveform/useWaveformView'
import AppHeader from './components/AppHeader'
import { EmptyState } from './components/EmptyState'
import Waveform, { type DrawPoint } from './components/Waveform'
import type { CurvePoint } from './hooks/useLaneCurve'
import { useStableFn } from './hooks/useStableFn'
import LevelMeter from './components/LevelMeter'
import { useTrackArea } from './components/tracks/useTrackArea'
import RenameDialog from './components/tracks/RenameDialog'
import WaveformToolbar from './components/waveform/WaveformToolbar'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import SelectionField from './components/SelectionField'
import TempoField from './components/TempoField'
import DesktopLayout from './components/layout/DesktopLayout'
import MobileLayout from './components/layout/MobileLayout'
import EditPanel from './components/EditPanel'
import VolumePanel from './components/VolumePanel'
import PitchToolHost, { type PitchDialogKind } from './components/PitchToolHost'
import SynthDialog from './components/SynthDialog'
import { flattenPitch } from './audio/pitchTools'
import MobilePlayBar from './components/MobilePlayBar'
import ShortcutsDialog from './components/ShortcutsDialog'
import ExportDialog from './components/ExportDialog'
import AboutDialog from './components/AboutDialog'
import HistoryDialog from './components/HistoryDialog'
import { useSettings } from './settings/settings'
import SettingsDialog from './settings/SettingsDialog'
import DebugOverlay from './debug/DebugOverlay'
import UpdatePrompt from './components/UpdatePrompt'
import { countRender } from './debug/debugStats'
import { LangContext, resolveLang, setLang, t } from './i18n/i18n'
import { setSpliceFadeSec } from './audio/edit'

/** 操作できないパネルを薄く表示し、触れないようにする */
/** 選択範囲なし（描画のたびに新しい空配列を作らない） */
const NO_SELECTIONS: Range[] = []
const disabledSx =(disabled: boolean) => (disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {})

export default function App() {
  countRender('App')
  const { settings, update: updateSettings } = useSettings()
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
  // テンポを解析できたら、BPM と1拍目の位置を設定に入れる（拍の線がそれに合う）
  const ed = useEditor(settings)
  // 設定のテーマ（既定 / ライト / ダーク）を反映する
  const { setMode } = useColorScheme()
  useEffect(() => setMode(settings.theme), [settings.theme, setMode])
  const theme = useTheme()
  // 大きめのスマホを横向きにすると幅が md を超えるので、横向きのスマホもスマホの配置にする
  const mobile = useMediaQuery(`${theme.breakpoints.down('md').replace('@media ', '')}, ${LANDSCAPE_PHONE}`)
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [synthOpen, setSynthOpen] = useState(false)
  const [renamingProject, setRenamingProject] = useState(false)
  const [pitchDialog, setPitchDialog] = useState<PitchDialogKind>(null)
  const { shown, edited, editing, selection, player, playback, loop, busy } = ed
  // 左上のループは通常再生の繰り返しの切り替え（加工欄のループはリアルタイム試聴）
  const toggleRepeat = () => ed.setRepeat(!ed.repeat)
  // 波形の表示範囲はツールバーと波形の両方から操作するため、ここで持つ
  const viewCtl = useWaveformView(ed.duration, player.livePosition, player.playing)
  const [pitchPercent, setPitchPercent] = usePersistentNumber('wevocalsynth.pitchPercent', 40)
  const { view } = viewCtl
  // 止まっているときに再生位置を動かしたら（矢印キーなど）、画面の外なら見える位置まで表示範囲を動かす
  const { reveal } = viewCtl
  useEffect(() => {
    if (!player.playing) reveal(player.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.position])
  const center = view.start + view.dur / 2

  const { menus, mobileMenus, context } = useAppMenus({
    hasClip: !!edited,
    hasSelection: !!selection,
    hasClipboard: ed.clip.hasClipboard,
    canTrim: ed.clip.canTrim,
    canUndo: ed.history.canUndo,
    canRedo: ed.history.canRedo,
    busy,
    showSpectrogram: ed.showSpec,
    showPitch: ed.showPitch,
    open: ed.picker.open,
    save: ed.saveProjectFile,
    openExport: () => ed.setExportOpen(true),
    undo: ed.history.undo,
    redo: ed.history.redo,
    // 切り取り・コピー・貼り付けは、フォーカスしている帯（波形なら音声、ピッチなら曲線）に効く
    cut: ed.clip.cut,
    copy: ed.clip.copy,
    paste: ed.clip.paste,
    trim: ed.clip.trim,
    clearSelection: ed.clearSelection,
    selectAll: ed.selectAll,
    playSelection: playback.playSelection,
    toggleLoop: toggleRepeat,
    toggleSpectrogram: () => ed.setShowSpec(!ed.showSpec),
    togglePitch: () => ed.setShowPitch(!ed.showPitch),
    showWave: ed.showWave,
    toggleWave: () => ed.setShowWave(!ed.showWave),
    showGain: ed.showGain,
    toggleGain: () => ed.setShowGain(!ed.showGain),
    showFormant: ed.showFormant,
    toggleFormant: () => ed.setShowFormant(!ed.showFormant),
    pitchReady: ed.showPitch && !!ed.pitch,
    setVoicing: (v) => ed.voicing.set(ed.selections, v),
    pitchLane: ed.focusLane === 'pitch',
    extract: (stem) => void ed.extract(stem),
    splitStems: () => void ed.splitStems(),
    duplicateTrack: () => ed.tracks.duplicate(),
    addTrack: () => ed.addPicker.open(),
    synth: () => setSynthOpen(true),
    showShortcuts: () => setShortcutsOpen(true),
    showSettings: () => setSettingsOpen(true),
    showHistory: () => setHistoryOpen(true),
    showAbout: () => setAboutOpen(true),
    ctrlS: settings.ctrlS,
  })

  // 編集パネルはファイルを開く前から表示しておく（開くまでは操作できない）
  const panelsDisabled = !editing || !edited
  const { showBeatGrid } = settings
  const { bpm, beatsPerBar, beatOffset } = ed.projectTempo
  const beatGrid = useMemo(
    () => (showBeatGrid && bpm > 0 ? { bpm, beatsPerBar: Math.max(1, beatsPerBar), offset: beatOffset } : null),
    [showBeatGrid, bpm, beatsPerBar, beatOffset],
  )
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
  const onWaveSeek = useStableFn((t: number) => (loop.playing && loop.seek(t)) || player.seek(t))
  const onWaveSelections = useStableFn((rs: Range[]) => editing && ed.setSelections(rs))
  const onWaveStretch = useStableFn(ed.stretchRange)
  const onWaveContext = useStableFn((x: number, y: number) => setContextPos({ x, y }))
  const onWaveDraw = useStableFn((from: DrawPoint, to: DrawPoint) => shown && ed.pitch && ed.pitchTarget.draw(shown, ed.pitch, from, to))
  const onWaveGrab = useStableFn((hz: Float32Array) => shown && ed.pitchTarget.replace(shown, hz))
  const onWaveDrawGain = useStableFn((from: CurvePoint, to: CurvePoint) => edited && shown === edited && ed.gainCurve.draw(edited, from, to))
  const onWaveDrawFormant = useStableFn((from: CurvePoint, to: CurvePoint) => edited && shown === edited && ed.formantCurve.draw(edited, from, to))
  const onWaveFocus = useStableFn(ed.setFocusLane)
  const waveform = shown ? (
    <Waveform
      clip={shown}
      position={player.position}
      // ループ再生中は、ループの読み位置に線を出す
      playing={player.playing || loop.playing}
      livePosition={loop.playing ? loop.livePosition : player.livePosition}
      selections={editing ? ed.selections : NO_SELECTIONS}
      // ループ再生中は範囲内ならループの中で移る（範囲外は通常の移動）
      onSeek={onWaveSeek}
      onSelectionsChange={onWaveSelections}
      onStretchRange={onWaveStretch}
      onContextMenu={onWaveContext}
      viewCtl={viewCtl}
      pitch={ed.pitch}
      showPitch={ed.showPitch}
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
    <EmptyState onOpen={ed.picker.open} onSynth={() => setSynthOpen(true)} />
  )
  // トラックの欄（右クリックメニュー・名前の変更を含む）
  const trackArea = useTrackArea(ed, busy, settings.showMeters ? player.analyser : null)
  // トラックが2本以上あるときだけ、波形の上にトラックの欄を出す（広げると波形付きの一覧、折りたたむとタブ）
  const editor = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {trackArea.panel(view)}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{waveform}</Box>
    </Box>
  )

  const viewTools = (
    <WaveformToolbar
      disabled={!shown}
      zoomed={viewCtl.zoomed}
      canZoomIn={viewCtl.canZoomIn}
      onZoomOut={() => viewCtl.zoomAround(1 / ZOOM_STEP, center)}
      onZoomIn={() => viewCtl.zoomAround(ZOOM_STEP, selection ? (selection.start + selection.end) / 2 : center)}
      onShowAll={viewCtl.showAll}
      showSpectrogram={ed.showSpec}
      onShowSpectrogramChange={ed.setShowSpec}
      showPitch={ed.showPitch}
      onShowPitchChange={ed.setShowPitch}
      showWave={ed.showWave}
      onShowWaveChange={ed.setShowWave}
      pitchFocused={ed.focusLane === 'pitch'}
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
      onFlatten={() => ed.pitchTools.edit(flattenPitch)}
      onSnap={() => setPitchDialog('snap')}
      onVibrato={() => setPitchDialog('vibrato')}
      onMidi={() => setPitchDialog('midi')}
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
      <PevenLabels.Provider value={lang === 'ja_jp' ? jaLabels : enLabels}>
      <WindowModeContext.Provider value={settings.dialogWindow === 'auto' ? autoWindowMode() : settings.dialogWindow}>
      {!mobile && <GlobalStyles styles={desktopStyles} />}
      {/* アプリとして画面の高さにぴったり収め、ページ全体はスクロールさせない */}
      <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
        <AppHeader
          menus={mobile ? mobileMenus : menus}
          canUndo={ed.history.canUndo}
          canRedo={ed.history.canRedo}
          busy={busy}
          onUndo={ed.history.undo}
          onRedo={ed.history.redo}
        />
        {ed.picker.input}
        {ed.addPicker.input}
        {mobile ? (
          <MobileLayout
            editor={editor}
            editorFooter={
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <SelectionField
                  duration={ed.duration}
                  selection={selection}
                  selectionCount={ed.selections.length}
                  onSelectionChange={setActiveSelection}
                  disabled={!editing}
                  fontSize={13}
                />
                {tempoField(13)}
              </Stack>
            }
            process={editPanel}
            volume={volumePanel}
            view={viewTools}
            playBar={
              <MobilePlayBar
                playing={player.playing}
                position={player.position}
                livePosition={player.livePosition}
                duration={ed.duration}
                hasSelection={!!selection}
                loopPlaying={ed.repeat}
                onTogglePlay={playback.togglePlay}
                onStop={playback.stop}
                onPlaySelection={playback.playSelection}
                onLoop={toggleRepeat}
                task={busy ? { label: ed.taskLabel, progress: ed.progress, onCancel: ed.cancelTask } : null}
                meter={settings.showMeters && <LevelMeter source={player.masterAnalysers} rows={2} width={96} height={7} label={t('meter.master')} />}
              />
            }
          />
        ) : (
          <DesktopLayout
            toolbar={
              <Toolbar
                playing={player.playing}
                position={player.position}
                livePosition={player.livePosition}
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
                onRename={() => setRenamingProject(true)}
                clip={shown}
                duration={ed.duration}
                selection={selection}
                selectionCount={ed.selections.length}
                onSelectionChange={setActiveSelection}
                busy={busy}
                progress={ed.progress}
                taskLabel={ed.taskLabel}
                onCancelTask={ed.cancelTask}
                source={ed.source}
                onSourceChange={ed.setSource}
                tempo={tempoField()}
              />
            }
          />
        )}
      </Box>

      <ContextMenu position={contextPos} entries={context} onClose={() => setContextPos(null)} />
      {trackArea.overlays}
      <RenameDialog
        name={renamingProject ? ed.fileName : null}
        title={t('project.rename')}
        onClose={() => setRenamingProject(false)}
        onRename={ed.setProjectName}
      />
      {edited && (
        <ExportDialog
          open={ed.exportOpen}
          onClose={() => ed.setExportOpen(false)}
          baseName={ed.exportName}
          sourceRate={edited.sampleRate}
          sourceChannels={edited.channels.length}
          hasSelection={!!selection}
          trackCount={ed.tracks.tracks.length}
          busy={busy}
          progress={ed.progress}
          onExport={ed.exportFile}
        />
      )}
      <PitchToolHost
        open={pitchDialog}
        onClose={() => setPitchDialog(null)}
        hasSelection={!!selection}
        selectionStart={selection ? selection.start : null}
        bpm={bpm}
        beatOffset={beatOffset}
        pitchTools={ed.pitchTools}
      />
      <SynthDialog open={synthOpen} bpm={bpm} onClose={() => setSynthOpen(false)} onCreate={ed.addSynth} />
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        labels={ed.history.labels}
        done={ed.history.done}
        onJump={(n) => !busy && ed.history.jumpTo(n)}
      />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        project={ed.fileName ? { name: ed.fileName, tempo: ed.projectTempo, onRename: ed.setProjectName, onTempoChange: ed.setProjectTempo } : null}
      />
      {settings.showDebug && <DebugOverlay />}
      <UpdatePrompt />
      {ed.addonDialog}

      <Snackbar open={!!ed.toast} autoHideDuration={4000} onClose={() => ed.setToast(null)}>
        {ed.toast ? (
          <Alert severity={ed.toast.severity} variant="filled" onClose={() => ed.setToast(null)}>
            {ed.toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
      </WindowModeContext.Provider>
      </PevenLabels.Provider>
    </LangContext.Provider>
  )
}
