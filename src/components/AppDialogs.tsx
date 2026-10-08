// App が開くダイアログをまとめて置く（開閉は useDialogs）
import { useRef } from 'react'
import { LicensesDialog } from 'pevenmui'
import type { segmentAt } from '../audio/tempoMap'
import type { Dialogs } from '../hooks/useDialogs'
import type { useEditor } from '../hooks/useEditor'
import type { useSelectionExport } from '../hooks/useSelectionExport'
import { t } from '../i18n/i18n'
import { flatEq } from '../effects/eq/eq'
import { licenseEntries } from '../licenses'
import { useAppSettings } from '../settings/settings'
import SettingsDialog from '../settings/SettingsDialog'
import AboutDialog from './AboutDialog'
import EqDialog from '../effects/eq/EqDialog'
import ExportDialog from './ExportDialog'
import HistoryDialog from './HistoryDialog'
import PitchToolHost, { type PitchDialogKind } from './PitchToolHost'
import RecordDialog from './RecordDialog'
import RepeatDialog from './RepeatDialog'
import SamplerDialog from './SamplerDialog'
import ShortcutsDialog from './ShortcutsDialog'
import SilenceDialog from './SilenceDialog'
import SoundSelectDialog from './SoundSelectDialog'
import SynthDialog from './SynthDialog'
import TempoChangeDialog from './TempoChangeDialog'
import VideoExportDialog from './VideoExportDialog'
import KanaCutDialog from './KanaCutDialog'

interface Props {
  ed: ReturnType<typeof useEditor>
  dialogs: Dialogs
  /** 今の位置のテンポ */
  bpm: number
  seg: ReturnType<typeof segmentAt>
  selectionExport: ReturnType<typeof useSelectionExport>
}

/** App が開くダイアログをまとめて置く（開閉は useDialogs） */
export default function AppDialogs({ ed, dialogs, bpm, seg, selectionExport }: Props) {
  const { settings, update: updateSettings } = useAppSettings()
  const { edited, selection, busy, player } = ed
  // 録音したトラックの名前の番号（録音 1、録音 2…）
  const recordCount = useRef(0)
  return (
    <>
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
      activeOnly={ed.exportActiveOnly}
      finish={selectionExport.finishOpts}
      onFinishChange={(f) => updateSettings({ exportNormalize: f.normalize, exportFadeMs: f.fadeMs })}
      folder={selectionExport.exportFolder}
    />
  )}
  {edited && (
    <VideoExportDialog
      open={ed.video.open}
      onClose={() => ed.video.setOpen(false)}
      baseName={ed.exportName}
      hasSelection={!!selection}
      trackCount={ed.tracks.tracks.length}
      busy={busy}
      progress={ed.progress}
      previewClip={edited}
      prefs={settings.exportVideo}
      onPrefsChange={(exportVideo) => updateSettings({ exportVideo })}
      onExport={(s, win) => void ed.video.exportVideo(s, win)}
      folder={selectionExport.exportFolder}
    />
  )}
  <PitchToolHost
    open={dialogs.arg<PitchDialogKind>('pitchTool')}
    onClose={dialogs.closer('pitchTool')}
    hasSelection={!!selection}
    selectionStart={selection ? selection.start : null}
    bpm={bpm}
    beatOffset={seg?.offset ?? ed.projectTempo.beatOffset}
    pitchTools={ed.pitchTools}
  />
  <SynthDialog open={dialogs.isOpen('synth')} bpm={bpm} onClose={dialogs.closer('synth')} onCreate={ed.addSynth} />
  <RepeatDialog open={dialogs.isOpen('repeat')} onClose={dialogs.closer('repeat')} onRepeat={ed.cmd.repeat} />
  <RecordDialog
    open={dialogs.isOpen('record')}
    input={{ deviceId: settings.inputDevice, echoCancellation: settings.recordEchoCancellation, noiseSuppression: settings.recordNoiseSuppression, autoGainControl: settings.recordAutoGain }}
    onDevice={(id) => updateSettings({ inputDevice: id })}
    onClose={dialogs.closer('record')}
    onUse={(clip) => ed.addSynth(clip, t('record.trackName', { n: ++recordCount.current }))}
  />
  <SilenceDialog
    open={dialogs.isOpen('silence')}
    bpm={bpm}
    beatsPerBar={seg?.beatsPerBar ?? ed.projectTempo.beatsPerBar}
    defaultSec={selection ? selection.end - selection.start : null}
    onClose={dialogs.closer('silence')}
    // 選択範囲があればその頭に、なければ再生位置に入れる
    onInsert={(sec) => ed.cmd.insertSilence(selection ? selection.start : player.livePosition(), sec)}
  />
  {edited && (
    <KanaCutDialog
      open={dialogs.isOpen('kanaCut')}
      onClose={dialogs.closer('kanaCut')}
      clip={edited}
      // 選択範囲があればそこだけ、なければ全体
      range={selection ?? { start: 0, end: (edited.channels[0]?.length ?? 0) / edited.sampleRate }}
      ensure={(id) => ed.ensureAddon(id)}
      onDone={(morae) => ed.tracks.setMorae(ed.tracks.activeId, morae)}
    />
  )}
  <SoundSelectDialog open={dialogs.isOpen('soundSelect')} clip={edited} onClose={dialogs.closer('soundSelect')} onSelect={selectionExport.onSoundsSelected} />
  <SamplerDialog
    open={dialogs.isOpen('sampler')}
    bpm={bpm}
    baseNote={ed.rangeNote == null ? null : Math.round(ed.rangeNote)}
    onClose={dialogs.closer('sampler')}
    onRun={(o) => void ed.placeOnMidi(o)}
  />
  <HistoryDialog
    open={dialogs.isOpen('history')}
    onClose={dialogs.closer('history')}
    labels={ed.history.labels}
    done={ed.history.done}
    onJump={(n) => !busy && ed.history.jumpTo(n)}
  />
  <LicensesDialog open={dialogs.isOpen('licenses')} onClose={dialogs.closer('licenses')} title={t('menu.licenses')} intro={t('licenses.intro')} entries={licenseEntries()} />
  <EqDialog
    open={dialogs.isOpen('eq')}
    trackName={ed.tracks.tracks.find((tr) => tr.id === ed.tracks.activeId)?.name ?? ''}
    eq={ed.tracks.effects[ed.tracks.activeId]?.eq ?? flatEq(settings.eqBands)}
    onChange={(eq) => ed.tracks.setEq(ed.tracks.activeId, eq)}
    playing={player.playing}
    onTogglePlay={ed.playback.togglePlay}
    onApply={() => void ed.applyTrackEq()}
    busy={busy}
    onClose={dialogs.closer('eq')}
  />
  <TempoChangeDialog
    open={dialogs.isOpen('tempoChange') && !!ed.tempo.changes}
    sections={ed.tempo.changes ?? []}
    onSeek={player.seek}
    onAdopt={() => {
      const [first, ...rest] = ed.tempo.changes ?? []
      if (!first) return
      const beatsPerBar = ed.projectTempo.beatsPerBar
      ed.setProjectTempo({ bpm: first.bpm, beatOffset: first.offset })
      ed.markers.addTempos(rest.map((s) => ({ time: s.time, tempo: { bpm: s.bpm, beatsPerBar } })))
    }}
    onClose={() => {
      ed.tempo.clearChanges()
      dialogs.close('tempoChange')
    }}
  />
  <AboutDialog open={dialogs.isOpen('about')} onClose={dialogs.closer('about')} />
  <ShortcutsDialog keymap={ed.keymap} open={dialogs.isOpen('shortcuts')} onClose={dialogs.closer('shortcuts')} wheelZoom={settings.wheelZoom} />
  <SettingsDialog
    open={dialogs.isOpen('settings')}
    focusSignal={dialogs.openCount('settings')}
    onClose={dialogs.closer('settings')}
    settings={settings}
    onChange={updateSettings}
    project={ed.fileName ? { name: ed.fileName, tempo: ed.projectTempo, onRename: ed.setProjectName, onTempoChange: ed.setProjectTempo, onBpmInput: ed.changeTempo } : null}
  />
    </>
  )
}
