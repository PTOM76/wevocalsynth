import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, GlobalStyles, Stack, Snackbar, useColorScheme, useMediaQuery, useTheme } from '@mui/material'
import { desktopStyles, LANDSCAPE_PHONE } from './theme'
import type { Range } from './audio/types'
import { useEditor } from './hooks/useEditor'
import { useAppMenus } from './hooks/useAppMenus'
import { useWaveformView, ZOOM_STEP } from './components/waveform/useWaveformView'
import AppHeader from './components/AppHeader'
import { DropOverlay, EmptyState } from './components/EmptyState'
import Waveform from './components/Waveform'
import TrackPanel from './components/tracks/TrackPanel'
import LevelMeter from './components/LevelMeter'
import RenameDialog from './components/tracks/RenameDialog'
import { trackMenuEntries } from './components/tracks/trackMenu'
import WaveformToolbar from './components/waveform/WaveformToolbar'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import SelectionField from './components/SelectionField'
import TempoField from './components/TempoField'
import DesktopLayout from './components/layout/DesktopLayout'
import MobileLayout from './components/layout/MobileLayout'
import { usePersistentNumber } from './components/layout/Splitter'
import EditPanel from './components/EditPanel'
import VolumePanel from './components/VolumePanel'
import { SnapDialog, VibratoDialog } from './components/PitchToolDialogs'
import { MidiDialog } from './components/MidiDialog'
import SynthDialog from './components/SynthDialog'
import { addVibrato, fitMidi, flattenPitch, snapPitch } from './audio/pitchTools'
import MobilePlayBar from './components/MobilePlayBar'
import ShortcutsDialog from './components/ShortcutsDialog'
import ExportDialog from './components/ExportDialog'
import AboutDialog from './components/AboutDialog'
import HistoryDialog from './components/HistoryDialog'
import { ContextMenu } from './components/menu/MenuList'
import { useSettings } from './settings/settings'
import SettingsDialog from './settings/SettingsDialog'
import DebugOverlay from './debug/DebugOverlay'
import UpdatePrompt from './components/UpdatePrompt'
import { countRender } from './debug/debugStats'
import { LangContext, resolveLang, setLang, t } from './i18n/i18n'

/** 操作できないパネルを薄く表示し、触れないようにする */
const disabledSx = (disabled: boolean) => (disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {})

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
  // テンポを解析できたら、BPM と1拍目の位置を設定に入れる（拍の線がそれに合う）
  const ed = useEditor(settings, (c) => updateSettings({ bpm: c.bpm, beatOffset: c.offset }))
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
  const [pitchDialog, setPitchDialog] = useState<'snap' | 'vibrato' | 'midi' | null>(null)
  const { shown, edited, editing, selection, player, playback, loop, busy } = ed
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
    hasClipboard: ed.cmd.hasClipboard,
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
    cut: ed.cmd.cut,
    copy: ed.cmd.copy,
    paste: ed.cmd.paste,
    trim: ed.cmd.trim,
    clearSelection: ed.clearSelection,
    selectAll: ed.selectAll,
    playSelection: playback.playSelection,
    toggleLoop: playback.toggleLoop,
    toggleSpectrogram: () => ed.setShowSpec(!ed.showSpec),
    togglePitch: () => ed.setShowPitch(!ed.showPitch),
    pitchReady: ed.showPitch && !!ed.pitch,
    setVoicing: (v) => ed.voicing.set(ed.selections, v),
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
  const { showBeatGrid, bpm, beatsPerBar, beatOffset } = settings
  const beatGrid = useMemo(
    () => (showBeatGrid && bpm > 0 ? { bpm, beatsPerBar: Math.max(1, beatsPerBar), offset: beatOffset } : null),
    [showBeatGrid, bpm, beatsPerBar, beatOffset],
  )
  const hasCurve = !!ed.pitchTarget.target && ed.pitchTarget.target.hz.some((v) => v > 0)
  const totalDuration = ed.editRanges.reduce((s, r) => s + r.end - r.start, 0)
  const setActiveSelection = (r: Range | null) => ed.setSelections(r ? [...ed.selections.slice(0, -1), r] : [])

  const tempoField = (fontSize?: number) => (
    <TempoField
      bpm={settings.bpm}
      candidates={ed.tempo.candidates}
      analyzing={ed.tempo.analyzing}
      disabled={!shown}
      fontSize={fontSize}
      onChange={(bpm, offset) => updateSettings(offset === undefined ? { bpm } : { bpm, beatOffset: offset })}
      onAnalyze={() =>
        shown &&
        void ed.tempo.analyze(
          shown,
          (c) => updateSettings({ bpm: c.bpm, beatOffset: c.offset }),
          (e) => ed.setToast({ severity: 'error', message: t('toast.tempoFailed', { error: String(e) }) }),
        )
      }
    />
  )

  const waveform = shown ? (
    <Waveform
      clip={shown}
      position={player.position}
      playing={player.playing}
      livePosition={player.livePosition}
      selections={editing ? ed.selections : []}
      onSeek={player.seek}
      onSelectionsChange={editing ? ed.setSelections : () => {}}
      onStretchRange={ed.stretchRange}
      onContextMenu={(x, y) => setContextPos({ x, y })}
      viewCtl={viewCtl}
      pitch={ed.pitch}
      showPitch={ed.showPitch}
      target={ed.pitchTarget.target?.clip === shown ? ed.pitchTarget.target.hz : null}
      penMode={ed.penMode && editing}
      onDraw={(from, to) => ed.pitch && ed.pitchTarget.draw(shown, ed.pitch, from, to)}
      spectrogram={ed.spec}
      showSpectrogram={ed.showSpec}
      pitchPercent={pitchPercent}
      onPitchPercentChange={setPitchPercent}
      beatGrid={beatGrid}
      ghosts={editing ? ed.tracks.ghosts : undefined}
    />
  ) : (
    <EmptyState onOpen={ed.picker.open} onSynth={() => setSynthOpen(true)} />
  )
  // トラックの右クリックメニューと名前の変更
  const [trackMenu, setTrackMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const trackActions = {
    tracks: ed.tracks.tracks,
    activeId: ed.tracks.activeId,
    mix: ed.tracks.mix,
    busy,
    select: ed.tracks.select,
    duplicate: ed.tracks.duplicate,
    rename: setRenaming,
    splitStems: (id: string) => void ed.splitStems(id),
    mergeDown: (id: string) => void ed.tracks.mergeDown(id),
    mergeAll: () => void ed.tracks.mergeAll(),
    toggleMute: ed.tracks.toggleMute,
    toggleSolo: ed.tracks.toggleSolo,
    overlay: ed.tracks.overlay,
    toggleOverlay: ed.tracks.toggleOverlay,
    remove: ed.tracks.remove,
  }
  const trackViewProps = {
    tracks: ed.tracks.tracks,
    activeId: ed.tracks.activeId,
    mix: ed.tracks.mix,
    disabled: busy,
    onSelect: ed.tracks.select,
    onToggleMute: ed.tracks.toggleMute,
    onToggleSolo: ed.tracks.toggleSolo,
    onContextMenu: (id: string, x: number, y: number) => setTrackMenu({ id, x, y }),
    meter: settings.showMeters ? player.analyser : null,
  }
  // トラックが2本以上あるときだけ、波形の上にトラックの欄を出す（広げると波形付きの一覧、折りたたむとタブ）
  const editor = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TrackPanel {...trackViewProps} view={view} />
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
      penMode={ed.penMode}
      onPenModeChange={ed.setPenMode}
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
                loopPlaying={loop.playing}
                onTogglePlay={playback.togglePlay}
                onStop={playback.stop}
                onPlaySelection={playback.playSelection}
                onLoop={playback.toggleLoop}
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
                loopPlaying={loop.playing}
                disabled={!shown}
                onTogglePlay={playback.togglePlay}
                onStop={playback.stop}
                onPlaySelection={playback.playSelection}
                onLoop={playback.toggleLoop}
                meter={settings.showMeters && <LevelMeter source={player.masterAnalysers} rows={2} width={80} height={9} label={t('meter.master')} />}
                viewTools={viewTools}
                canEdit={editing && !busy}
                hasClipboard={ed.cmd.hasClipboard}
                onCut={ed.cmd.cut}
                onCopy={ed.cmd.copy}
                onPaste={ed.cmd.paste}
                onTrim={ed.cmd.trim}
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
      <ContextMenu
        position={trackMenu}
        entries={trackMenu ? trackMenuEntries(trackMenu.id, trackActions) : []}
        onClose={() => setTrackMenu(null)}
      />
      <RenameDialog
        name={renaming ? (ed.tracks.tracks.find((tr) => tr.id === renaming)?.name ?? '') : null}
        onClose={() => setRenaming(null)}
        onRename={(name) => renaming && ed.tracks.rename(renaming, name)}
      />
      {edited && (
        <ExportDialog
          open={ed.exportOpen}
          onClose={() => ed.setExportOpen(false)}
          baseName={ed.baseName}
          sourceRate={edited.sampleRate}
          sourceChannels={edited.channels.length}
          hasSelection={!!selection}
          trackCount={ed.tracks.tracks.length}
          busy={busy}
          progress={ed.progress}
          onExport={ed.exportFile}
        />
      )}
      <SnapDialog
        open={pitchDialog === 'snap'}
        hasSelection={!!selection}
        onClose={() => setPitchDialog(null)}
        onRun={(o) => ed.pitchTools.edit((cur, f0, k0, k1) => snapPitch(cur, f0, k0, k1, o))}
      />
      <VibratoDialog
        open={pitchDialog === 'vibrato'}
        hasSelection={!!selection}
        bpm={settings.bpm}
        onClose={() => setPitchDialog(null)}
        onRun={(o) => ed.pitchTools.edit((cur, f0, k0, k1) => addVibrato(cur, f0, k0, k1, o))}
      />
      <MidiDialog
        open={pitchDialog === 'midi'}
        hasSelection={!!selection}
        bpm={settings.bpm}
        // MIDI の先頭を置く位置の初期値: 選択範囲があればその始まり、なければ1拍目の位置
        defaultOffset={selection ? selection.start : settings.beatOffset}
        onClose={() => setPitchDialog(null)}
        onRun={(o) => ed.pitchTools.edit((cur, f0, k0, k1) => fitMidi(cur, f0, k0, k1, o))}
      />
      <SynthDialog open={synthOpen} bpm={settings.bpm} onClose={() => setSynthOpen(false)} onCreate={ed.addSynth} />
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        labels={ed.history.labels}
        done={ed.history.done}
        onJump={(n) => !busy && ed.history.jumpTo(n)}
      />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={updateSettings} />
      {ed.dragOver && <DropOverlay />}
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
    </LangContext.Provider>
  )
}
