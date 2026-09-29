import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { AUDIO_ACCEPT, decodeFile } from '../audio/decode'
import { downloadBlob } from '../audio/wav'
import { EXPORT_EXT, exportAudio } from '../audio/export/exportAudio'
import { sliceRanges } from '../audio/multiRange'
import type { ExportSettings } from '../components/ExportDialog'
import { PROJECT_EXT, isProjectFile, loadProject, saveProject, type Project } from '../project/projectFile'
import { applyPitchCurve, spliceProcessed } from '../audio/edit'
import { applyEditToRanges, normalizeRanges } from '../audio/multiRange'
import { usePlayer } from '../audio/usePlayer'
import { useRealtimePreview } from '../audio/realtime/useRealtimePreview'
import { analyzeF0, analyzeSpectrogram, type TempoCandidate } from '../dsp/engine'
import { MODE_SETTINGS, detectMode, type Mode } from '../audio/detectMode'
import type { EditParams } from '../components/EditPanel'
import type { Source } from '../components/StatusBar'
import { useHistory } from './useHistory'
import { useFileDrop } from './useFileDrop'
import { useClipAnalysis } from './useClipAnalysis'
import { usePreview } from './usePreview'
import { usePitchTarget } from './usePitchTarget'
import { usePitchVoicing } from './usePitchVoicing'
import { usePitchTools } from './usePitchTools'
import { useTempo } from './useTempo'
import { clipBytes, reportMemory } from '../debug/debugStats'
import { useShortcuts } from './useShortcuts'
import { useClipCommands } from './useClipCommands'
import { useTask } from './useTask'
import { useFilePicker } from './useFilePicker'
import { usePlayback } from './usePlayback'
import { useRangeNote } from './useRangeNote'
import { useAutosave } from './useAutosave'
import { f0ParamsFrom, type Settings } from '../settings/settings'
import { t, type MessageKey } from '../i18n/i18n'

export type Toast = { severity: 'success' | 'error' | 'info'; message: string }

/** 加工パラメータのうち、適用後やファイルを開いたときに戻す値 */
const NEUTRAL = { semitones: 0, stretch: 1, formantSemitones: 0 }

/** エディタ全体の状態と操作。画面の組み立て（App）から切り離してある */
/** 加工を適用したときの、操作履歴に出す名前（変えた項目だけを並べる） */
function applyLabel(p: EditParams): string {
  const parts: string[] = []
  const signed = (v: number) => `${v > 0 ? '+' : ''}${+v.toFixed(3)}`
  if (p.semitones !== 0) parts.push(`${t('process.pitch')} ${signed(p.semitones)}`)
  if (p.stretch !== 1) parts.push(`${t('process.length')} ×${+p.stretch.toFixed(3)}`)
  if (p.preserveFormant && p.formantSemitones !== 0) parts.push(`${t('process.formantShift')} ${signed(p.formantSemitones)}`)
  return parts.join('・') || t('common.apply')
}

/** `onTempo` はテンポを解析できたときに呼ぶ（BPM・1拍目の位置を設定に入れる） */
export function useEditor(settings: Settings, onTempo: (c: TempoCandidate) => void) {
  // テンポの自動解析（ファイルを開いた直後）。openClip から最新の関数を呼べるよう ref にも持つ
  const tempo = useTempo()
  const tempoRef = useRef({ tempo, onTempo })
  tempoRef.current = { tempo, onTempo }
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<Clip | null>(null)
  const history = useHistory({ limit: settings.historyLimit, budgetBytes: settings.historyMemoryMb * 2 ** 20 })
  const [source, setSource] = useState<Source>('edited')
  // 選択範囲（複数可、開始位置順に正規化）。開始・終了の入力欄は一番後ろの範囲を編集する
  const [selections, setSelectionsState] = useState<Range[]>([])
  const setSelections = (rs: Range[]) => setSelectionsState(normalizeRanges(rs))
  const selection = selections[selections.length - 1] ?? null
  const [params, setParams] = useState<EditParams>({
    ...NEUTRAL,
    algorithm: 'psola',
    preserveFormant: false,
  })
  const [showPitch, setShowPitch] = useState(false)
  const [showSpec, setShowSpec] = useState(false)
  const [penMode, setPenMode] = useState(false)
  const [autoMode, setAutoMode] = useState<Mode | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const playbackRef = useRef<ReturnType<typeof usePlayback> | null>(null)

  // 処理の開始時に再生を止める（playback は後で作るため関数で遅延参照する）
  const task = useTask(
    () => playbackRef.current?.stopAll(),
    (e) => setToast({ severity: 'error', message: t('toast.processFailed', { error: String(e) }) }),
  )
  const { busy, progress, setProgress } = task
  const edited = history.present
  // デバッグ表示: 原音と加工後の音声データの量（同じものなら1つ分）
  useEffect(() => {
    reportMemory('original', clipBytes(original))
    reportMemory('edited', edited === original ? 0 : clipBytes(edited))
  }, [original, edited])
  const shown = source === 'original' ? original : edited
  const duration = shown ? clipDuration(shown) : 0
  const editing = source === 'edited' && !!edited
  const player = usePlayer(shown)
  const pitchTarget = usePitchTarget()

  const fail = (key: MessageKey) => (e: unknown) => setToast({ severity: 'error', message: t(key, { error: String(e) }) })
  // ピッチ・スペクトログラムは表示を ON にしたときだけ解析する
  // ピッチ解析の設定。変えたら解析し直す（key が変わる）
  const f0Params = f0ParamsFrom(settings)
  const rawPitch = useClipAnalysis(
    showPitch,
    shown,
    (c) => analyzeF0(c.channels, c.sampleRate, f0Params),
    fail('toast.pitchFailed'),
    JSON.stringify(f0Params),
  )
  // 強制表示・非表示の指定を反映したピッチ。表示・ピッチの加工・適用のすべてでこれを使う
  const voicing = usePitchVoicing(shown, rawPitch)
  const pitch = voicing.pitch
  const spec = useClipAnalysis(showSpec, shown, (c) => analyzeSpectrogram(c.channels, c.sampleRate), fail('toast.specFailed'))

  // 加工・音量編集の対象（選択範囲、なければ全体）
  const editRanges: Range[] = edited ? (selections.length ? selections : [{ start: 0, end: clipDuration(edited) }]) : []
  const multi = editRanges.length > 1
  const preview = usePreview(edited, multi ? null : (editRanges[0] ?? null), params, editing && !busy)
  const rangeNote = useRangeNote(editing && !multi ? edited : null, editRanges[0] ?? null)
  const loop = useRealtimePreview(edited, multi ? null : (editRanges[0] ?? null), params.semitones, params.stretch)

  const commit = (clip: Clip, label: string) => {
    history.commit(clip, label)
    setSource('edited')
  }
  const cmd = useClipCommands({
    edited,
    selections,
    setSelections,
    editRanges,
    getPosition: player.livePosition,
    seek: player.seek,
    commit,
    notify: (message) => setToast({ severity: 'info', message }),
  })

  /** 読み込んだ音声（またはプロジェクト）を画面に反映する */
  const openClip = useCallback(
    (clip: Clip, name: string, project: Project | null) => {
      setFileName(name)
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
      // 新しい素材ならボーカル／楽器を自動判定して初期値にする（プロジェクトは保存時の設定を使う）
      setAutoMode(null)
      tempoRef.current.tempo.reset()
      // 新しい素材ならテンポを解析して、BPM と1拍目の位置を設定に入れる（プロジェクトは今の設定のまま）
      if (!project && settings.autoTempo) {
        void tempoRef.current.tempo.analyze(
          clip,
          (best) => {
            tempoRef.current.onTempo(best)
            setToast({ severity: 'info', message: t('toast.tempoDetected', { bpm: best.bpm }) })
          },
          fail('toast.tempoFailed'),
        )
      }
      if (!project && settings.initialMode !== 'auto') {
        setParams((p) => ({ ...p, ...MODE_SETTINGS[settings.initialMode as Mode] }))
      } else if (!project) {
        void detectMode(clip)
          .then(({ mode }) => {
            setAutoMode(mode)
            setParams((p) => ({ ...p, ...MODE_SETTINGS[mode] }))
          })
          .catch(() => {})
      }
    },
    [history, pitchTarget, cmd, settings.initialMode, settings.autoTempo],
  )

  const loadFile = useCallback(
    async (file: File) => {
      try {
        // .wvsp はプロジェクト（原音・加工後・パラメータ）として開く
        const project = isProjectFile(file) ? await loadProject(file) : null
        if (project) openClip(project.edited, project.fileName, project)
        else openClip(await decodeFile(file), file.name, null)
      } catch (e) {
        setToast({ severity: 'error', message: t('toast.loadFailed', { file: file.name, error: String(e) }) })
      }
    },
    [openClip],
  )
  const dragOver = useFileDrop((f) => void loadFile(f))

  const apply = () =>
    task.run(async () => {
      if (!edited || !editRanges.length) return
      // 同じ設定のプレビューがあれば、それを差し込むだけで済ませる
      const spliced = preview.result && !multi ? spliceProcessed(edited, preview.result) : null
      const result = spliced
        ? { clip: spliced.clip, ranges: [spliced.range] }
        : await applyEditToRanges(edited, editRanges, params, setProgress)
      commit(result.clip, applyLabel(params))
      setSelections(selections.length ? result.ranges : [])
      setParams((p) => ({ ...p, ...NEUTRAL }))
      setToast({ severity: 'success', message: t('toast.applied') })
    })

  // Shift+右端ドラッグ: 範囲をドラッグ後の長さに伸縮する（ピッチは変えない）
  const stretchRange = (r: Range, dur: number) =>
    task.run(async () => {
      if (!edited) return
      const opts = { ...params, ...NEUTRAL, stretch: dur / (r.end - r.start) }
      const result = await applyEditToRanges(edited, [r], opts, setProgress)
      commit(result.clip, t('history.stretch', { ratio: opts.stretch.toFixed(2) }))
      setSelections(result.ranges)
    })

  const applyCurve = () =>
    task.run(async () => {
      const target = pitchTarget.target
      if (!edited || !pitch || shown !== edited || target?.clip !== edited) return
      const next = await applyPitchCurve(edited, pitch, target.hz, params, setProgress)
      if (next) {
        commit(next, t('history.curve'))
        setToast({ severity: 'success', message: t('toast.applied') })
      }
      pitchTarget.clear()
    })

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'audio'
  const saveProjectFile = () =>
    task.run(async () => {
      if (!original || !edited) return
      downloadBlob(saveProject({ fileName, original, edited, params }), `${baseName}${PROJECT_EXT}`)
      setToast({ severity: 'success', message: t('toast.saved') })
    })

  // 書き出しダイアログの設定で音声ファイルを作る。選択範囲が複数ならつなげて書き出す
  const exportFile = (s: ExportSettings) =>
    task.run(async () => {
      if (!edited) return
      const clip = s.selectionOnly && selections.length ? sliceRanges(edited, selections) : edited
      const blob = await exportAudio(
        clip,
        { ...s, range: null, sampleRate: s.sampleRate || clip.sampleRate },
        setProgress,
      )
      downloadBlob(blob, `${s.fileName.trim()}${EXPORT_EXT[s.format]}`)
      setExportOpen(false)
      setToast({ severity: 'success', message: t('toast.exported') })
    })

  // 通常の再生と試聴は、片方を始めたらもう片方を止める
  // ピッチ曲線の加工と試聴（試聴を始めるときはほかの再生を止める）
  const pitchTools = usePitchTools({
    shown,
    edited,
    pitch,
    pitchTarget,
    selections,
    opts: params,
    setShowPitch,
    stopOthers: () => playbackRef.current?.stopAll(),
  })
  const playback = usePlayback(player, preview.player, loop, pitchTools.preview, duration, selection)
  playbackRef.current = playback

  const picker = useFilePicker(`${AUDIO_ACCEPT},${PROJECT_EXT}`, (f) => void loadFile(f))

  // 作業状態の自動保存と、起動時の復元
  useAutosave(
    settings.autoRestore,
    { fileName, original, edited },
    params,
    (project) => {
      openClip(project.edited, project.fileName, project)
      setToast({ severity: 'info', message: t('toast.restored') })
    },
    (e) => console.warn('autosave failed', e),
  )

  const openExport = () => edited && setExportOpen(true)

  const selectAll = () => edited && setSelections([{ start: 0, end: clipDuration(edited) }])
  const clearSelection = () => setSelections([])

  useShortcuts({
    togglePlay: playback.togglePlay,
    undo: history.undo,
    redo: history.redo,
    cut: cmd.cut,
    copy: cmd.copy,
    paste: cmd.paste,
    selectAll,
    clearSelection,
    open: () => picker.open(),
    // Ctrl+S はプロジェクト保存か書き出しか（設定）。もう一方は Ctrl+Shift+S
    save: settings.ctrlS === 'export' ? openExport : saveProjectFile,
    saveAlt: settings.ctrlS === 'export' ? saveProjectFile : openExport,
    exportAudio: openExport,
    pitchShift: showPitch && editing && pitchTools.ready && !busy ? pitchTools.shift : undefined,
  })

  return {
    // 素材と履歴
    fileName, original, edited, shown, duration, editing, source, setSource, history, commit,
    // 処理状態と通知
    busy, progress, toast, setToast,
    // 選択範囲
    selections, selection, setSelections, selectAll, clearSelection, editRanges, multi,
    // 加工パラメータ
    params, setParams, autoMode, rangeNote,
    // 再生
    player, preview, loop, playback,
    // 表示（ピッチ・スペクトログラム）とピッチ描画
    showPitch, setShowPitch, showSpec, setShowSpec, penMode, setPenMode, pitch, voicing, spec, pitchTarget, pitchTools, tempo,
    // 操作
    cmd, apply, stretchRange, applyCurve, saveProjectFile, exportFile, exportOpen, setExportOpen, baseName, picker, dragOver,
  }
}
