import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { AUDIO_ACCEPT, decodeFile } from 'wevocal-lib'
import { DEFAULT_TEMPO, PROJECT_EXT, isProjectFile, loadProject, type Project, type ProjectTempo } from '../project/projectFile'
import { applyFormantCurve, applyGainCurve, applyPitchCurve, spliceProcessed } from '../audio/edit'
import { applyEditToRanges, normalizeRanges } from '../audio/multiRange'
import { usePlayer } from '../audio/usePlayer'
import { useRealtimePreview } from '../audio/realtime/useRealtimePreview'
import { analyzeF0, analyzeSpectrogram } from '../dsp/engine'
import { MODE_SETTINGS, detectMode, type Mode } from '../audio/detectMode'
import type { EditParams } from '../components/EditPanel'
import type { Source } from '../components/StatusBar'
import { useHistory } from './useHistory'
import { useFileDrop } from 'pevenmui'
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
import { useVocalExtract } from './useVocalExtract'
import { useAddonInstall } from '../addons/AddonInstallDialog'
import { useTracks } from './useTracks'
import { usePitchClipboard } from './usePitchClipboard'
import { useLanes } from './useLanes'
import { useOutput } from './useOutput'
import { useSeek } from './useSeek'
import { CURVE_HOP_SEC, useLaneCurve } from './useLaneCurve'
import { useFormantCurve } from './useFormantCurve'
import { makeTrack, newTrackId } from '../audio/tracks'
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

export function useEditor(settings: Settings) {
  // テンポの自動解析（ファイルを開いた直後）。openClip から最新の関数を呼べるよう ref にも持つ
  const tempo = useTempo()
  const tempoRef = useRef({ tempo })
  tempoRef.current = { tempo }
  // プロジェクトのテンポ（BPM・拍子・1拍目の位置）。プロジェクトファイルと自動保存に入る
  const [projectTempo, setProjectTempoState] = useState<ProjectTempo>(DEFAULT_TEMPO)
  const setProjectTempo = useCallback((patch: Partial<ProjectTempo>) => setProjectTempoState((p) => ({ ...p, ...patch })), [])
  // プロジェクト名。初めは開いたファイルの名前（拡張子を除く）で、変えられる。保存・書き出しのファイル名の初期値になる
  const [fileName, setFileName] = useState('')
  // プロジェクト名を自分で変えたか（変えていなければ、書き出しの名前に _wevocal を付ける）
  const [named, setNamed] = useState(false)
  const history = useHistory({ limit: settings.historyLimit, budgetBytes: settings.historyMemoryMb * 2 ** 20 })
  // 編集できるのは選んでいるトラックだけ。original / edited はそのトラックの原音・加工後
  const tracks = useTracks(history)
  const original = history.original
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
  // 帯（波形・スペクトログラム・ピッチ・音量・フォルマント）の表示とフォーカス
  const lanes = useLanes()
  const { showWave, setShowWave, showSpec, setShowSpec, showPitch, setShowPitch, showGain, setShowGain, showFormant, setShowFormant, focusLane, setFocusLane } = lanes
  // 音量の帯に描いた曲線（再生にすぐ反映し、適用で音声に書き込む）
  const gainCurve = useLaneCurve()
  const [penMode, setPenMode] = useState(false)
  const [autoMode, setAutoMode] = useState<Mode | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const playbackRef = useRef<ReturnType<typeof usePlayback> | null>(null)

  // 処理の開始時に再生を止める（playback は後で作るため関数で遅延参照する）
  const task = useTask(
    () => playbackRef.current?.stopAll(),
    (e) => setToast({ severity: 'error', message: t('toast.processFailed', { error: String(e) }) }),
    () => setToast({ severity: 'info', message: t('toast.cancelled') }),
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
  // ほかのトラックも、ミュート・ソロに従って一緒に鳴らす
  // 音量の適用前の値。再生中の音（加工後の表示のとき、対象の範囲だけ）にすぐ反映する
  const [gainDb, setGainDb] = useState(0)
  // 通常再生のループ（選択範囲、なければ全体を繰り返す）
  const [repeat, setRepeat] = useState(false)
  const [pan, setPan] = useState(0)
  // 選択範囲の音量・パンは範囲を選んでいるときだけ（範囲が無いときはトラックのフェーダーを使う）
  const editRangesForGain: Range[] = source === 'edited' && edited ? selections : []
  const player = usePlayer(shown, {
    id: history.activeId,
    others: tracks.others,
    faders: tracks.faders,
    muted: tracks.activeMuted,
    liveGain: (gainDb || pan) && editRangesForGain.length ? { ranges: editRangesForGain, db: gainDb, pan } : null,
    gainCurve: editing && gainCurve.curve?.clip === edited ? { db: gainCurve.curve.values, hopSec: CURVE_HOP_SEC } : null,
    loop: repeat && duration > 0 ? (selection ?? { start: 0, end: duration }) : null,
  })
  const pitchTarget = usePitchTarget()
  // フォルマントの帯に描いた曲線（試聴ボタンで加工して聴き、適用で音声に書き込む）
  const formantCurve = useFormantCurve(editing ? edited : null, () => playbackRef.current?.stopAll())

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

  // ボーカル抽出（追加機能）。未導入なら確認ダイアログ（addonDialog）を出す
  const addons = useAddonInstall()
  const vocal = useVocalExtract({
    edited,
    editRanges,
    model: settings.vocalModel,
    gpu: settings.vocalGpu,
    keepHighBand: settings.vocalKeepHighBand,
    ensure: addons.ensure,
    run: task.run,
    setProgress,
    commit,
    onVocals: () => setParams((p) => ({ ...p, ...MODE_SETTINGS.vocal })),
    notify: (message) => setToast({ severity: 'success', message }),
    tracks: history.tracks,
    activeId: history.activeId,
    split: tracks.split,
  })

  /** 読み込んだ音声（またはプロジェクト）を画面に反映する */
  const openClip = useCallback(
    (clip: Clip, name: string, project: Project | null, ids?: string[]) => {
      // 拡張子は除く（以前のプロジェクトファイルは、拡張子付きの名前を持っていた）
      setFileName(name.replace(/\.[^.]+$/, ''))
      setNamed(!!project?.named)
      // 古いプロジェクト（テンポを持たない）と新しい素材は既定のテンポから（新しい素材は下で解析する）
      setProjectTempoState(project?.tempo ?? DEFAULT_TEMPO)
      // プロジェクトはトラックごとに。自動保存から戻すときは保存先の ID を引き継ぐ（保存し直さずに済む）
      const list = project
        ? project.tracks.map((tr, i) => ({ id: ids?.[i] || newTrackId(), name: tr.name, original: tr.original, clip: tr.edited }))
        : [makeTrack(name, clip)]
      history.reset(list, list[project ? project.active : 0].id)
      // フェーダーはプロジェクトに保存した値から（新しいファイルは中立）
      const saved = project?.tracks ?? []
      tracks.resetMix({
        faders: Object.fromEntries(saved.map((tr, i) => [list[i].id, { db: tr.volume ?? 0, pan: tr.pan ?? 0 }])),
        mix: Object.fromEntries(saved.map((tr, i) => [list[i].id, { mute: !!tr.mute, solo: !!tr.solo }])),
        overlay: saved.flatMap((tr, i) => (tr.overlay ? [list[i].id] : [])),
      })
      setGainDb(0)
      setPan(0)
      setSource('edited')
      setSelectionsState([])
      cmd.clearClipboard()
      // 前のファイルの表示設定を持ち越すと、開いた直後に重い解析やプレビュー処理が走るため戻す
      lanes.reset()
      gainCurve.clear()
      formantCurve.clear()
      setPenMode(false)
      pitchTarget.clear()
      setParams((p) => ({ ...(project ? project.params : p), ...NEUTRAL }))
      // 新しい素材ならボーカル／楽器を自動判定して初期値にする（プロジェクトは保存時の設定を使う）
      setAutoMode(null)
      tempoRef.current.tempo.reset()
      // 新しい素材ならテンポを解析して、BPM と1拍目の位置をプロジェクトに入れる（プロジェクトは保存時のテンポのまま）
      if (!project && settings.autoTempo) {
        void tempoRef.current.tempo.analyze(
          clip,
          (best) => {
            setProjectTempo({ bpm: best.bpm, beatOffset: best.offset })
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
    [history, tracks, lanes, gainCurve, formantCurve, pitchTarget, cmd, settings.initialMode, settings.autoTempo, setProjectTempo],
  )

  const loadFile = useCallback(
    (file: File) =>
      // 読み込み中は進捗を出す（中断したら読み込んだ結果を使わない）
      task.run(t('task.loading'), async (signal) => {
        try {
          // .wvsp はプロジェクト（原音・加工後・パラメータ）として開く
          const project = isProjectFile(file) ? await loadProject(file, setProgress) : null
          const clip = project ? null : await decodeFile(file, setProgress)
          if (signal.aborted) return
          if (project) openClip(project.tracks[project.active].edited, project.fileName, project)
          else if (clip) openClip(clip, file.name, null)
        } catch (e) {
          if (!signal.aborted) setToast({ severity: 'error', message: t('toast.loadFailed', { file: file.name, error: String(e) }) })
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClip],
  )

  const apply = () =>
    task.run(t('task.processing'), async (signal) => {
      if (!edited || !editRanges.length) return
      // 同じ設定のプレビューがあれば、それを差し込むだけで済ませる
      const spliced = preview.result && !multi ? spliceProcessed(edited, preview.result) : null
      const result = spliced
        ? { clip: spliced.clip, ranges: [spliced.range] }
        : await applyEditToRanges(edited, editRanges, params, setProgress)
      // 中断されていたら結果を使わない（ほかの処理も同じ）
      if (signal.aborted) return
      commit(result.clip, applyLabel(params))
      setSelections(selections.length ? result.ranges : [])
      setParams((p) => ({ ...p, ...NEUTRAL }))
      setToast({ severity: 'success', message: t('toast.applied') })
    })

  // Shift+右端ドラッグ: 範囲をドラッグ後の長さに伸縮する（ピッチは変えない）
  const stretchRange = (r: Range, dur: number) =>
    task.run(t('task.stretching'), async (signal) => {
      if (!edited) return
      const opts = { ...params, ...NEUTRAL, stretch: dur / (r.end - r.start) }
      const result = await applyEditToRanges(edited, [r], opts, setProgress)
      if (signal.aborted) return
      commit(result.clip, t('history.stretch', { ratio: opts.stretch.toFixed(2) }))
      setSelections(result.ranges)
    })

  const applyCurve = () =>
    task.run(t('task.curve'), async (signal) => {
      const target = pitchTarget.target
      if (!edited || !pitch || shown !== edited || target?.clip !== edited) return
      const next = await applyPitchCurve(edited, pitch, target.hz, params, setProgress)
      if (signal.aborted) return
      if (next) {
        commit(next, t('history.curve'))
        setToast({ severity: 'success', message: t('toast.applied') })
      }
      pitchTarget.clear()
    })

  /** 描いた音量の曲線を音声に書き込み、履歴に積む */
  const applyGain = () => {
    const c = gainCurve.curve
    if (!edited || c?.clip !== edited) return
    commit(applyGainCurve(edited, c.values, CURVE_HOP_SEC), t('gainCurve.label'))
    gainCurve.clear()
    setToast({ severity: 'success', message: t('toast.applied') })
  }

  /** 描いたフォルマントの曲線を音声に書き込み、履歴に積む */
  const applyFormant = () =>
    task.run(t('task.formant'), async (signal) => {
      const c = formantCurve.curve
      if (!edited || c?.clip !== edited) return
      const r = await applyFormantCurve(edited, c.values, CURVE_HOP_SEC, setProgress)
      if (signal.aborted) return
      if (r) {
        commit(r.clip, t('formantCurve.label'))
        setToast({ severity: 'success', message: t('toast.applied') })
      }
      formantCurve.clear()
    })

  // プロジェクトの保存と書き出し
  const { baseName, exportName, saveProjectFile, exportFile } = useOutput({
    fileName,
    named,
    params,
    tempo: projectTempo,
    history,
    tracks,
    selections,
    task,
    notify: (message) => setToast({ severity: 'success', message }),
    closeExport: () => setExportOpen(false),
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
  const curvePreviews = { pause: () => (pitchTools.preview.pause(), formantCurve.preview.pause()) }
  const playback = usePlayback(player, preview.player, loop, curvePreviews, duration, selection)
  playbackRef.current = playback

  const picker = useFilePicker(`${AUDIO_ACCEPT},${PROJECT_EXT}`, (f) => void loadFile(f))
  // 開いている作業に、別のファイルを新しいトラックとして足す
  /** 作った音（音を0から作る）を、新しいトラックとして足す。何も開いていなければ、最初のトラックとして開く */
  const addSynth = (clip: Clip, name: string) => {
    if (history.tracks.length) tracks.addClip(clip, name)
    else openClip(clip, name, null)
  }
  /** 音声ファイルを新しいトラックとして足す */
  const addTrackFile = (f: File) =>
    void task.run(t('task.loading'), async (signal) => {
      try {
        const clip = await decodeFile(f, setProgress)
        if (!signal.aborted) tracks.addClip(clip, f.name)
      } catch (e) {
        if (!signal.aborted) setToast({ severity: 'error', message: t('toast.loadFailed', { file: f.name, error: String(e) }) })
      }
    })
  const addPicker = useFilePicker(AUDIO_ACCEPT, addTrackFile)
  // ドロップした音声は、もう開いているならトラックとして足す（プロジェクトファイルは開き直す）
  useFileDrop((f) => (history.tracks.length && !isProjectFile(f) ? addTrackFile(f) : void loadFile(f)))

  // 作業状態の自動保存と、起動時の復元
  useAutosave(
    settings.autoRestore,
    { fileName, named, tempo: projectTempo, tracks: history.tracks, activeId: history.activeId, faders: tracks.faders, mix: tracks.mix, overlay: tracks.overlay },
    params,
    (project, ids) => {
      openClip(project.tracks[project.active].edited, project.fileName, project, ids)
      setToast({ severity: 'info', message: t('toast.restored') })
    },
    (e) => console.warn('autosave failed', e),
  )

  const openExport = () => edited && setExportOpen(true)

  const selectAll = () => edited && setSelections([{ start: 0, end: clipDuration(edited) }])
  const clearSelection = () => setSelections([])

  // 矢印キー・Home / End での再生位置の移動
  const { seekBy, seekEdge } = useSeek({ shown, duration, showBeatGrid: settings.showBeatGrid, ...projectTempo, getPosition: player.livePosition, seek: player.seek })

  // ピッチの曲線の切り取り・コピー・貼り付け（ピッチの帯にフォーカスしているとき）
  const pitchClip = usePitchClipboard({
    edited,
    pitch: editing ? pitch : null,
    pitchTarget,
    selections,
    getPosition: player.livePosition,
    notify: (message) => setToast({ severity: 'info', message }),
  })
  /** フォーカスしている帯に効く、切り取り・コピー・貼り付け・選択範囲のみ残す */
  const onPitch = focusLane === 'pitch'
  const clip = {
    cut: onPitch ? pitchClip.cut : cmd.cut,
    copy: onPitch ? pitchClip.copy : cmd.copy,
    paste: onPitch ? pitchClip.paste : cmd.paste,
    // 選択範囲のみ残すは、音声だけの操作
    trim: onPitch ? () => {} : cmd.trim,
    canTrim: !onPitch,
    hasClipboard: onPitch ? pitchClip.hasClipboard : cmd.hasClipboard,
  }

  useShortcuts({
    seekBy,
    seekEdge,
    togglePlay: playback.togglePlay,
    undo: history.undo,
    redo: history.redo,
    cut: clip.cut,
    copy: clip.copy,
    paste: clip.paste,
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
    fileName, projectTempo, setProjectTempo, setProjectName: (name: string) => {
      if (!name.trim()) return
      setFileName(name.trim())
      setNamed(true)
    }, original, edited, shown, duration, editing, source, setSource, history, commit,
    // 処理状態と通知
    busy, progress, taskLabel: task.label, cancelTask: task.cancel, toast, setToast,
    // 選択範囲
    selections, selection, setSelections, selectAll, clearSelection, editRanges, multi,
    // 加工パラメータ
    params, setParams, autoMode, rangeNote,
    // 再生
    player, preview, loop, playback, repeat, setRepeat,
    // 表示（ピッチ・スペクトログラム）とピッチ描画
    showPitch, setShowPitch, showSpec, setShowSpec, showWave, setShowWave, showGain, setShowGain, gainCurve, applyGain, showFormant, setShowFormant, formantCurve, applyFormant, focusLane, setFocusLane, clip, penMode, setPenMode, pitch, voicing, spec, pitchTarget, pitchTools, tempo,
    // 操作
    tracks, addPicker, addSynth, gainDb, setGainDb, pan, setPan,
    cmd, apply, stretchRange, extract: vocal.extract, splitStems: vocal.splitStems, addonDialog: addons.dialog, applyCurve, saveProjectFile, exportFile, exportOpen, setExportOpen, baseName, exportName, picker,
  }
}
