import { useCallback, useRef, useState } from 'react'
import { Alert, Box, Card, CardContent, Container, Snackbar, Stack } from '@mui/material'
import type { Clip, Range } from './audio/types'
import { clipDuration } from './audio/types'
import { decodeFile } from './audio/decode'
import { downloadBlob, downloadWav, type WavFormat } from './audio/wav'
import { PROJECT_EXT, isProjectFile, loadProject, saveProject } from './project/projectFile'
import { applyPitchCurve, spliceProcessed } from './audio/edit'
import { applyEditToRanges, normalizeRanges } from './audio/multiRange'
import { usePlayer } from './audio/usePlayer'
import { useRealtimePreview } from './audio/realtime/useRealtimePreview'
import { analyzeF0, analyzeSpectrogram } from './dsp/engine'
import { useHistory } from './hooks/useHistory'
import { useFileDrop } from './hooks/useFileDrop'
import { useClipAnalysis } from './hooks/useClipAnalysis'
import { usePreview } from './hooks/usePreview'
import { usePitchTarget } from './hooks/usePitchTarget'
import { useShortcuts } from './hooks/useShortcuts'
import { useClipCommands } from './hooks/useClipCommands'
import { usePlayback } from './hooks/usePlayback'
import { useRangeNote } from './hooks/useRangeNote'
import AppHeader from './components/AppHeader'
import { DropOverlay, EmptyState } from './components/EmptyState'
import { ClipInfo, TransportBar, type Source } from './components/TransportBar'
import Waveform from './components/Waveform'
import EditPanel, { type EditParams } from './components/EditPanel'
import VolumePanel from './components/VolumePanel'

type Toast = { severity: 'success' | 'error' | 'info'; message: string }

/** 加工パラメータのうち、適用後やファイルを開いたときに戻す値 */
const NEUTRAL = { semitones: 0, stretch: 1, formantSemitones: 0 }

export default function App() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<Clip | null>(null)
  const history = useHistory()
  const [source, setSource] = useState<Source>('edited')
  // 選択範囲（複数可、開始位置順に正規化）。開始・終了の入力欄は一番後ろの範囲を編集する
  const [selections, setSelectionsState] = useState<Range[]>([])
  const setSelections = (rs: Range[]) => setSelectionsState(normalizeRanges(rs))
  const selection = selections[selections.length - 1] ?? null
  const [params, setParams] = useState<EditParams>({
    ...NEUTRAL,
    algorithm: 'wsola',
    preserveFormant: false,
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showPitch, setShowPitch] = useState(false)
  const [showSpec, setShowSpec] = useState(false)
  const [penMode, setPenMode] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const edited = history.present
  const shown = source === 'original' ? original : edited
  const duration = shown ? clipDuration(shown) : 0
  const editing = source === 'edited' && !!edited
  const player = usePlayer(shown)
  const pitchTarget = usePitchTarget()

  const fail = (what: string) => (e: unknown) => setToast({ severity: 'error', message: `${what}: ${String(e)}` })
  // ピッチ・スペクトログラムは表示を ON にしたときだけ解析する
  const pitch = useClipAnalysis(showPitch, shown, (c) => analyzeF0(c.channels, c.sampleRate), fail('ピッチ解析に失敗しました'))
  const spec = useClipAnalysis(showSpec, shown, (c) => analyzeSpectrogram(c.channels, c.sampleRate), fail('スペクトログラムの計算に失敗しました'))

  // 加工・音量編集の対象（選択範囲、なければ全体）
  const editRanges: Range[] = edited ? (selections.length ? selections : [{ start: 0, end: clipDuration(edited) }]) : []
  const multi = editRanges.length > 1
  const preview = usePreview(edited, multi ? null : (editRanges[0] ?? null), params, editing && !busy)
  const rangeNote = useRangeNote(editing && !multi ? edited : null, editRanges[0] ?? null)
  const loop = useRealtimePreview(edited, multi ? null : (editRanges[0] ?? null), params.semitones, params.stretch)

  const commit = (clip: Clip) => {
    history.commit(clip)
    setSource('edited')
  }
  const cmd = useClipCommands({
    edited,
    selections,
    setSelections,
    editRanges,
    position: player.position,
    seek: player.seek,
    commit,
    notify: (message) => setToast({ severity: 'info', message }),
  })

  const loadFile = useCallback(
    async (file: File) => {
      try {
        // .wvsp はプロジェクト（原音・加工後・パラメータ）として開く
        const project = isProjectFile(file) ? await loadProject(file) : null
        const clip = project ? project.edited : await decodeFile(file)
        setFileName(project ? project.fileName : file.name)
        setOriginal(project ? project.original : clip)
        history.reset(clip)
        setSource('edited')
        setSelectionsState([])
        cmd.clearClipboard()
        // 前のファイルの表示設定を持ち越すと、開いた直後に重い解析やプレビュー処理が走るため戻す
        setShowPitch(false)
        setShowSpec(false)
        setPenMode(false)
        pitchTarget.clear()
        setParams((p) => ({ ...(project ? project.params : p), ...NEUTRAL }))
      } catch (e) {
        setToast({ severity: 'error', message: `読み込めませんでした: ${file.name} (${String(e)})` })
      }
    },
    [history, pitchTarget, cmd],
  )
  const dragOver = useFileDrop((f) => void loadFile(f))

  /** 時間のかかる処理を、処理中表示とエラー通知付きで実行する */
  const runTask = async (task: () => Promise<void>) => {
    setBusy(true)
    setProgress(0)
    playback.stopAll()
    try {
      await task()
    } catch (e) {
      fail('処理に失敗しました')(e)
    } finally {
      setBusy(false)
    }
  }

  const apply = () =>
    runTask(async () => {
      if (!edited || !editRanges.length) return
      // 同じ設定のプレビューがあれば、それを差し込むだけで済ませる
      const spliced = preview.result && !multi ? spliceProcessed(edited, preview.result) : null
      const result = spliced
        ? { clip: spliced.clip, ranges: [spliced.range] }
        : await applyEditToRanges(edited, editRanges, params, setProgress)
      commit(result.clip)
      setSelections(selections.length ? result.ranges : [])
      setParams((p) => ({ ...p, ...NEUTRAL }))
      setToast({ severity: 'success', message: '適用しました' })
    })

  // Shift+右端ドラッグ: 範囲をドラッグ後の長さに伸縮する（ピッチは変えない）
  const stretchRange = (r: Range, dur: number) =>
    runTask(async () => {
      if (!edited) return
      const opts = { ...params, ...NEUTRAL, stretch: dur / (r.end - r.start) }
      const result = await applyEditToRanges(edited, [r], opts, setProgress)
      commit(result.clip)
      setSelections(result.ranges)
    })

  const applyCurve = () =>
    runTask(async () => {
      const target = pitchTarget.target
      if (!edited || !pitch || shown !== edited || target?.clip !== edited) return
      const next = await applyPitchCurve(edited, pitch, target.hz, params, setProgress)
      if (next) {
        commit(next)
        setToast({ severity: 'success', message: '適用しました' })
      }
      pitchTarget.clear()
    })

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'audio'
  const saveProjectFile = () =>
    runTask(async () => {
      if (!original || !edited) return
      downloadBlob(await saveProject({ fileName, original, edited, params }), `${baseName}${PROJECT_EXT}`)
      setToast({ severity: 'success', message: '保存しました' })
    })

  const exportWav = (format: WavFormat) => {
    if (edited) downloadWav(edited, `${baseName}_wevocal.wav`, format)
  }

  // 通常の再生と試聴は、片方を始めたらもう片方を止める
  const playback = usePlayback(player, preview.player, loop, duration, selection)

  useShortcuts({ togglePlay: playback.togglePlay, undo: history.undo, redo: history.redo, cut: cmd.cut, copy: cmd.copy, paste: cmd.paste })
  const openFile = () => inputRef.current?.click()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppHeader
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canExport={!!edited}
        busy={busy}
        onUndo={history.undo}
        onRedo={history.redo}
        onOpen={openFile}
        onExport={exportWav}
        onSave={saveProjectFile}
      />
      <input
        ref={inputRef}
        type="file"
        accept={`audio/*,.wav,${PROJECT_EXT}`}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void loadFile(f)
          e.target.value = ''
        }}
      />

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {!shown ? (
          <EmptyState onOpen={openFile} />
        ) : (
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <ClipInfo fileName={fileName} clip={shown} duration={duration} source={source} onSourceChange={setSource} />
                  <Waveform
                    clip={shown}
                    position={player.position}
                    playing={player.playing}
                    selections={editing ? selections : []}
                    onSeek={player.seek}
                    onSelectionsChange={editing ? setSelections : () => {}}
                    onStretchRange={stretchRange}
                    pitch={pitch}
                    showPitch={showPitch}
                    onShowPitchChange={setShowPitch}
                    target={pitchTarget.target?.clip === shown ? pitchTarget.target.hz : null}
                    penMode={penMode && editing}
                    onPenModeChange={setPenMode}
                    onDraw={(from, to) => shown && pitch && pitchTarget.draw(shown, pitch, from, to)}
                    onApplyCurve={applyCurve}
                    onClearCurve={pitchTarget.clear}
                    busy={busy}
                    spectrogram={spec}
                    showSpectrogram={showSpec}
                    onShowSpectrogramChange={setShowSpec}
                  />
                  <TransportBar
                    playing={player.playing}
                    position={player.position}
                    duration={duration}
                    selection={selection}
                    editable={editing}
                    busy={busy}
                    hasClipboard={cmd.hasClipboard}
                    onTogglePlay={playback.togglePlay}
                    onStop={playback.stop}
                    onPlaySelection={playback.playSelection}
                    onSelectionChange={(r) => setSelections(r ? [...selections.slice(0, -1), r] : [])}
                    onCut={cmd.cut}
                    onCopy={cmd.copy}
                    onPaste={cmd.paste}
                    onTrim={cmd.trim}
                  />
                </Stack>
              </CardContent>
            </Card>

            {editing && editRanges.length > 0 && (
              <EditPanel
                params={params}
                onChange={setParams}
                targetDuration={editRanges.reduce((s, r) => s + r.end - r.start, 0)}
                hasSelection={!!selection}
                busy={busy}
                progress={progress}
                onApply={apply}
                preview={multi ? 'multi' : preview.state}
                previewPlaying={preview.player.playing}
                onPreview={playback.togglePreview}
                loopPlaying={loop.playing}
                onLoop={playback.toggleLoop}
                currentMidi={rangeNote}
              />
            )}
            {editing && (
              <VolumePanel hasSelection={!!selection} busy={busy} onGain={cmd.gain} onAction={cmd.volume} />
            )}
          </Stack>
        )}
      </Container>

      {dragOver && <DropOverlay />}

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
