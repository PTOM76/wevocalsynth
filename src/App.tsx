import { useState } from 'react'
import { Alert, Box, Card, CardContent, Container, Snackbar, Stack, useMediaQuery, useTheme } from '@mui/material'
import { useEditor } from './hooks/useEditor'
import { useAppMenus } from './hooks/useAppMenus'
import AppHeader from './components/AppHeader'
import { DropOverlay, EmptyState } from './components/EmptyState'
import { ClipInfo, TransportBar } from './components/TransportBar'
import Waveform from './components/Waveform'
import EditPanel from './components/EditPanel'
import VolumePanel from './components/VolumePanel'
import MobilePlayBar from './components/MobilePlayBar'
import ShortcutsDialog from './components/ShortcutsDialog'
import { ContextMenu } from './components/menu/MenuList'

/** 操作できないパネルを薄く表示し、触れないようにする */
const disabledSx = (disabled: boolean) => (disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {})

export default function App() {
  const ed = useEditor()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { shown, edited, editing, selection, player, playback, loop, busy } = ed

  const { menus, context } = useAppMenus({
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
    exportWav: ed.exportWav,
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
    showShortcuts: () => setShortcutsOpen(true),
  })

  // 編集パネルはファイルを開く前から表示しておく（開くまでは操作できない）
  const panelsDisabled = !editing || !edited
  const totalDuration = ed.editRanges.reduce((s, r) => s + r.end - r.start, 0)

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: mobile ? 10 : 0 }}>
      <AppHeader
        menus={menus}
        canUndo={ed.history.canUndo}
        canRedo={ed.history.canRedo}
        busy={busy}
        onUndo={ed.history.undo}
        onRedo={ed.history.redo}
      />
      {ed.picker.input}

      {/* PC は画面幅を活かして広く、スマホは余白を詰める */}
      <Container maxWidth={mobile ? false : 'xl'} sx={{ py: mobile ? 1 : 3, px: mobile ? 1 : 3 }}>
        <Stack spacing={mobile ? 1 : 3}>
          <Card>
            <CardContent sx={{ p: mobile ? 1.5 : 2 }}>
              {!shown ? (
                <EmptyState onOpen={ed.picker.open} />
              ) : (
                <Stack spacing={2}>
                  <ClipInfo
                    fileName={ed.fileName}
                    clip={shown}
                    duration={ed.duration}
                    source={ed.source}
                    onSourceChange={ed.setSource}
                  />
                  <Waveform
                    clip={shown}
                    position={player.position}
                    playing={player.playing}
                    selections={editing ? ed.selections : []}
                    onSeek={player.seek}
                    onSelectionsChange={editing ? ed.setSelections : () => {}}
                    onStretchRange={ed.stretchRange}
                    onContextMenu={(x, y) => setContextPos({ x, y })}
                    pitch={ed.pitch}
                    showPitch={ed.showPitch}
                    onShowPitchChange={ed.setShowPitch}
                    target={ed.pitchTarget.target?.clip === shown ? ed.pitchTarget.target.hz : null}
                    penMode={ed.penMode && editing}
                    onPenModeChange={ed.setPenMode}
                    onDraw={(from, to) => ed.pitch && ed.pitchTarget.draw(shown, ed.pitch, from, to)}
                    onApplyCurve={ed.applyCurve}
                    onClearCurve={ed.pitchTarget.clear}
                    busy={busy}
                    spectrogram={ed.spec}
                    showSpectrogram={ed.showSpec}
                    onShowSpectrogramChange={ed.setShowSpec}
                  />
                  <TransportBar
                    playing={player.playing}
                    position={player.position}
                    duration={ed.duration}
                    selection={selection}
                    editable={editing}
                    hidePlayback={mobile}
                    busy={busy}
                    hasClipboard={ed.cmd.hasClipboard}
                    onTogglePlay={playback.togglePlay}
                    onStop={playback.stop}
                    onPlaySelection={playback.playSelection}
                    onSelectionChange={(r) => ed.setSelections(r ? [...ed.selections.slice(0, -1), r] : [])}
                    onCut={ed.cmd.cut}
                    onCopy={ed.cmd.copy}
                    onPaste={ed.cmd.paste}
                    onTrim={ed.cmd.trim}
                  />
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* PC は「加工」と「音量」を横に並べ、スマホは縦に積む */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={mobile ? 1 : 3} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flex: { md: '7 1 0' }, width: '100%', ...disabledSx(panelsDisabled) }} aria-disabled={panelsDisabled}>
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
            <Box sx={{ flex: { md: '5 1 0' }, width: '100%', ...disabledSx(panelsDisabled) }} aria-disabled={panelsDisabled}>
              <VolumePanel
                hasSelection={!!selection}
                busy={busy || panelsDisabled}
                onGain={ed.cmd.gain}
                onAction={ed.cmd.volume}
              />
            </Box>
          </Stack>
        </Stack>
      </Container>

      {mobile && shown && (
        <MobilePlayBar
          playing={player.playing}
          position={player.position}
          duration={ed.duration}
          hasSelection={!!selection}
          loopPlaying={loop.playing}
          onTogglePlay={playback.togglePlay}
          onStop={playback.stop}
          onPlaySelection={playback.playSelection}
          onLoop={playback.toggleLoop}
        />
      )}

      <ContextMenu position={contextPos} entries={context} onClose={() => setContextPos(null)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {ed.dragOver && <DropOverlay />}

      <Snackbar open={!!ed.toast} autoHideDuration={4000} onClose={() => ed.setToast(null)}>
        {ed.toast ? (
          <Alert severity={ed.toast.severity} variant="filled" onClose={() => ed.setToast(null)}>
            {ed.toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
