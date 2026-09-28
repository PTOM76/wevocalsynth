import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, GlobalStyles, Snackbar, useColorScheme, useMediaQuery, useTheme } from '@mui/material'
import { desktopStyles } from './theme'
import type { Range } from './audio/types'
import { useEditor } from './hooks/useEditor'
import { useAppMenus } from './hooks/useAppMenus'
import { useWaveformView, ZOOM_STEP } from './components/waveform/useWaveformView'
import AppHeader from './components/AppHeader'
import { DropOverlay, EmptyState } from './components/EmptyState'
import Waveform from './components/Waveform'
import WaveformToolbar from './components/waveform/WaveformToolbar'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import SelectionField from './components/SelectionField'
import DesktopLayout from './components/layout/DesktopLayout'
import MobileLayout from './components/layout/MobileLayout'
import { usePersistentNumber } from './components/layout/Splitter'
import EditPanel from './components/EditPanel'
import VolumePanel from './components/VolumePanel'
import { SnapDialog, VibratoDialog } from './components/PitchToolDialogs'
import { addVibrato, flattenPitch, snapPitch } from './audio/pitchTools'
import MobilePlayBar from './components/MobilePlayBar'
import ShortcutsDialog from './components/ShortcutsDialog'
import ExportDialog from './components/ExportDialog'
import AboutDialog from './components/AboutDialog'
import { ContextMenu } from './components/menu/MenuList'
import { useSettings } from './settings/settings'
import SettingsDialog from './settings/SettingsDialog'
import DebugOverlay from './debug/DebugOverlay'
import { countRender } from './debug/debugStats'
import { LangContext, resolveLang, setLang } from './i18n/i18n'

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
  const ed = useEditor(settings)
  // 設定のテーマ（既定 / ライト / ダーク）を反映する
  const { setMode } = useColorScheme()
  useEffect(() => setMode(settings.theme), [settings.theme, setMode])
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [pitchDialog, setPitchDialog] = useState<'snap' | 'vibrato' | null>(null)
  const { shown, edited, editing, selection, player, playback, loop, busy } = ed
  // 波形の表示範囲はツールバーと波形の両方から操作するため、ここで持つ
  const viewCtl = useWaveformView(ed.duration, player.livePosition, player.playing)
  const [pitchPercent, setPitchPercent] = usePersistentNumber('wevocalsynth.pitchPercent', 40)
  const { view } = viewCtl
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
    showShortcuts: () => setShortcutsOpen(true),
    showSettings: () => setSettingsOpen(true),
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

  const editor = shown ? (
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
    />
  ) : (
    <EmptyState onOpen={ed.picker.open} />
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
      <VolumePanel hasSelection={!!selection} busy={busy || panelsDisabled} onGain={ed.cmd.gain} onAction={ed.cmd.volume} />
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
        {mobile ? (
          <MobileLayout
            editor={editor}
            editorFooter={
              <SelectionField
                duration={ed.duration}
                selection={selection}
                selectionCount={ed.selections.length}
                onSelectionChange={setActiveSelection}
                disabled={!editing}
                fontSize={13}
              />
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
                source={ed.source}
                onSourceChange={ed.setSource}
              />
            }
          />
        )}
      </Box>

      <ContextMenu position={contextPos} entries={context} onClose={() => setContextPos(null)} />
      {edited && (
        <ExportDialog
          open={ed.exportOpen}
          onClose={() => ed.setExportOpen(false)}
          baseName={ed.baseName}
          sourceRate={edited.sampleRate}
          sourceChannels={edited.channels.length}
          hasSelection={!!selection}
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
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={updateSettings} />
      {ed.dragOver && <DropOverlay />}
      {settings.showDebug && <DebugOverlay />}

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
