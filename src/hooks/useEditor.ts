import { tempoSegments } from '../audio/tempoMap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { AUDIO_ACCEPT, configurePlayback, decodeFile } from 'wevocal-lib'
import { DEFAULT_TEMPO, PROJECT_EXT, isProjectFile, loadProject, type Project, type ProjectTempo } from '../project/projectFile'
import { normalizeRanges } from '../audio/multiRange'
import { usePlayer } from '../audio/usePlayer'
import { useRealtimePreview } from '../audio/realtime/useRealtimePreview'
import { analyzeF0 } from '../dsp/engine'
import { analyzeSpectrogram } from '../audio/spectrogram'
import { detectMode, modeSettings, type Mode } from '../audio/detectMode'
import type { EditParams } from '../components/EditPanel'
import type { Source } from '../components/StatusBar'
import { useHistory } from './useHistory'
import { useFileDrop, useFilePicker, useLeaveGuard, useRecentFiles } from 'pevenmui'
import { useClipAnalysis } from './useClipAnalysis'
import { usePreview } from './usePreview'
import { usePitchTarget } from './usePitchTarget'
import { usePitchVoicing } from './usePitchVoicing'
import { usePitchTools } from './usePitchTools'
import { useTempo } from './useTempo'
import { clipBytes, reportAudioContext, reportMemory } from '../debug/debugStats'
import { useClipCommands } from './useClipCommands'
import { useTask } from './useTask'
import { isOffloaded, offloadClip, restoreClip, useOffloadVersion } from '../audio/originalStore'
import { canSaveToFolder, configureFileAccess, fileRefOf, initFileAccess, isMobile, isStandalone, type SavedFile } from 'pevenmui/web'
import { usePlayback } from './usePlayback'
import { useRangeNote } from './useRangeNote'
import { useVocalExtract } from './useVocalExtract'
import { useVoiceSplit } from './useVoiceSplit'
import { setGpuLostHandler } from '../audio/vocalExtract'
import { useAddonInstall } from '../addons/AddonInstallDialog'
import { useVideoExport } from './useVideoExport'
import { installedManifest } from '../addons/addons'
import { useTracks } from './useTracks'
import { useMarkers } from './useMarkers'
import { useLanes } from './useLanes'
import { useOutput } from './useOutput'
import { useSeek } from './useSeek'
import { useStartup } from './useStartup'
import { useEditorKeys } from './useEditorKeys'
import { CURVE_HOP_SEC, useLaneCurve } from './useLaneCurve'
import { useFormantCurve } from './useFormantCurve'
import { fromStoredSettings, makeTrack, newTrackId, toStoredSettings } from '../audio/tracks'
import { f0ParamsFrom, useAppSettings } from '../settings/settings'
import { editActions, NEUTRAL } from './editActions'
import { t, type MessageKey } from '../i18n/i18n'
import { idbGet, idbPut } from '../project/idb'

/** 通知。`actions` は通知の中に出すボタン（次の操作の案内） */
export type Toast = { severity: 'success' | 'error' | 'info'; message: string; actions?: { label: string; onClick: () => void }[] }

// 最近使用したファイルはこのアプリの IndexedDB に保存し、フォルダは「wevocal-用途」の名前で覚えさせる
initFileAccess({ store: { get: idbGet, put: idbPut }, idPrefix: 'wevocal' })

/** タイトルバーの名前（index.html の title） */
const APP_TITLE = typeof document === 'undefined' ? '' : document.title

/** エディタ全体の状態と操作。画面の組み立て（App）から切り離してある */
export function useEditor() {
  const { settings, update: updateSettings } = useAppSettings()
  // テンポの自動解析（ファイルを開いた直後）。openClip から最新の関数を呼べるよう ref にも持つ
  const tempo = useTempo()
  const tempoRef = useRef({ tempo })
  tempoRef.current = { tempo }
  // プロジェクトのテンポ（BPM・拍子・1拍目の位置）。プロジェクトファイルと自動保存に入る
  // 自動解析しないときの BPM は設定の既定値
  const defaultTempo: ProjectTempo = { ...DEFAULT_TEMPO, bpm: settings.defaultBpm }
  const [projectTempo, setProjectTempoState] = useState<ProjectTempo>(defaultTempo)
  // ボーカル・楽器のモードで使う処理方式（設定の既定値）
  const modes = modeSettings(settings)
  const markers = useMarkers()
  const setProjectTempo = useCallback((patch: Partial<ProjectTempo>) => setProjectTempoState((p) => ({ ...p, ...patch })), [])
  // プロジェクト名。初めは開いたファイルの名前（拡張子を除く）で、変えられる。保存・書き出しのファイル名の初期値になる
  const [fileName, setFileName] = useState('')
  // プロジェクト名を自分で変えたか（変えていなければ、書き出しの名前に _wevocal を付ける）
  const [named, setNamed] = useState(false)
  const history = useHistory({ limit: settings.historyLimit, budgetBytes: settings.historyMemoryMb * 2 ** 20 }, settings.keepOriginal)
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
    algorithm: settings.vocalAlgorithm,
    preserveFormant: false,
  })
  // 帯（波形・スペクトログラム・ピッチ・音量・フォルマント）の表示とフォーカス
  const lanes = useLanes()
  const { showWave, setShowWave, showSpec, setShowSpec, showPitch, setShowPitch, showGain, setShowGain, showFormant, setShowFormant, focusLane, setFocusLane } = lanes
  // 音量の帯に描いた曲線（再生にすぐ反映し、適用で音声に書き込む）
  const gainCurve = useLaneCurve()
  // ペン（描く）と掴む（ピッチの線を上下に動かす）は、どちらか一方だけ
  const [penMode, setPenModeState] = useState(false)
  const [grabMode, setGrabModeState] = useState(false)
  const setPenMode = (v: boolean) => {
    setPenModeState(v)
    if (v) setGrabModeState(false)
  }
  const setGrabMode = (v: boolean) => {
    setGrabModeState(v)
    if (v) setPenModeState(false)
  }
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
  // 原音の退避（メモリの節約。audio/originalStore.ts）。退避・復帰で描き直す
  const offloadVersion = useOffloadVersion()
  // デバッグ表示: 原音と加工後の音声データの量（同じものなら1つ分。退避中の原音は 0）
  useEffect(() => {
    reportMemory('original', clipBytes(original))
    reportMemory('edited', edited === original ? 0 : clipBytes(edited))
  }, [original, edited, offloadVersion])
  // 原音を聴いているのに退避中なら、戻るまでは加工後を出す（退避中の空の Clip を画面や再生に渡さない）
  const originalReady = !!original && !isOffloaded(original)
  const shown = source === 'original' && originalReady ? original : edited
  useEffect(() => {
    if (source !== 'original' || !original || !isOffloaded(original)) return
    restoreClip(original).catch((e) => setToast({ severity: 'error', message: t('toast.processFailed', { error: String(e) }) }))
  }, [source, original, offloadVersion])
  // メモリを節約する設定なら、加工したトラックの原音を退避する（原音を聴いている選択中のトラックは除く）
  const saveMemory = settings.saveMemory === 'on' || (settings.saveMemory === 'auto' && isMobile())
  useEffect(() => {
    if (!saveMemory) return
    for (const tr of history.tracks) {
      if (tr.original === tr.clip || (source === 'original' && tr.id === history.activeId)) continue
      void offloadClip(tr.original)
    }
  }, [saveMemory, history.tracks, history.activeId, source])
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
    eqs: tracks.eqs,
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
    t('job.pitch'),
  )
  // 強制表示・非表示の指定を反映したピッチ。表示・ピッチの加工・適用のすべてでこれを使う
  const voicing = usePitchVoicing(shown, rawPitch)
  const pitch = voicing.pitch
  const spec = useClipAnalysis(showSpec, shown, analyzeSpectrogram, fail('toast.specFailed'), '', t('job.spec'))

  // 加工・音量編集の対象（選択範囲、なければ全体）
  const editRanges: Range[] = edited ? (selections.length ? selections : [{ start: 0, end: clipDuration(edited) }]) : []
  const multi = editRanges.length > 1
  const preview = usePreview(edited, multi ? null : (editRanges[0] ?? null), params, editing && !busy)
  const rangeNote = useRangeNote(editing && !multi ? edited : null, editRanges[0] ?? null)
  const loop = useRealtimePreview(edited, multi ? null : (editRanges[0] ?? null), params.semitones, params.stretch, settings.realtimeAlign)
  // 再生方式の切り替え（開発者向け）を、再生の部品すべてに効かせる
  const { suspendWhenStopped, playbackSession } = settings
  useEffect(() => configurePlayback({ suspendWhenStopped, playbackSession, report: reportAudioContext }), [suspendWhenStopped, playbackSession])

  // 原音を持たない設定にしたら、加工後の表示に戻す（原音の切り替えは出さない）
  useEffect(() => {
    if (!settings.keepOriginal) setSource('edited')
  }, [settings.keepOriginal])

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
    seekAfterInsert: settings.seekAfterInsert,
  })

  // WebGPU のデバイスが失われたら、ブラウザの再起動を勧める（失われたサイトの WebGPU は、再起動まで止められることがある）
  useEffect(() => {
    setGpuLostHandler((message) => setToast({ severity: 'error', message: t('extract.gpuLost', { reason: message }) }))
    return () => setGpuLostHandler(undefined)
  }, [])

  // ボーカル抽出、スペクトログラム（追加機能）。未導入なら確認ダイアログ（addonDialog）を出す
  const addons = useAddonInstall()
  // スペクトログラムの追加機能を導入済みか（ツールバーのボタンは導入済みのときだけ出す）
  const [analyzerInstalled, setAnalyzerInstalled] = useState(false)
  useEffect(() => void installedManifest('analyzer').then((m) => setAnalyzerInstalled(!!m)), [])
  /** スペクトログラムの帯を出す前に、追加機能を確かめる（未導入なら導入の案内。やめたら出さない） */
  const requestShowSpec = async (v: boolean) => {
    if (v && !(await addons.ensure('analyzer'))) return
    if (v) setAnalyzerInstalled(true)
    setShowSpec(v)
  }
  const splitVoices = useVoiceSplit({
    tracks: history.tracks,
    activeId: history.activeId,
    selections,
    split: tracks.split,
    run: task.run,
    setProgress,
    notify: (message) => setToast({ severity: 'success', message }),
  })
  const vocal = useVocalExtract({
    edited,
    editRanges,
    model: settings.vocalModel,
    gpu: settings.vocalGpu,
    keepHighBand: settings.vocalKeepHighBand,
    memoryMb: settings.vocalMemoryMb,
    fresh: settings.vocalFreshExtract,
    enableFresh: () => updateSettings({ vocalFreshExtract: true }),
    ensure: addons.ensure,
    run: task.run,
    setProgress,
    commit,
    onVocals: () => setParams((p) => ({ ...p, ...modes.vocal })),
    notify: (message) => setToast({ severity: 'success', message }),
    tracks: history.tracks,
    activeId: history.activeId,
    split: tracks.split,
    // 抽出の前に、加工したトラックの原音を退避する（設定によらず。抽出は数百MB使うため）
    prepare: async () => {
      for (const tr of history.tracks) if (tr.original !== tr.clip && !(source === 'original' && tr.id === history.activeId)) await offloadClip(tr.original)
    },
    // 作業を保存する前に、退避した原音を戻す
    restoreAll: async () => {
      for (const tr of history.tracks) await restoreClip(tr.original)
    },
    // 今の作業（メモリが足りないときの抽出で、保存して再読み込みするため。自動保存と同じ中身）
    snapshot: () =>
      history.tracks.length
        ? {
            fileName,
            named,
            params,
            tempo: projectTempo,
            markers: markers.markers,
            tracks: history.tracks.map((tr) => ({ name: tr.name, original: tr.original, edited: tr.clip, ...toStoredSettings(tracks.settingsOf(tr.id)) })),
            active: Math.max(0, history.tracks.findIndex((tr) => tr.id === history.activeId)),
          }
        : null,
  })

  /** 読み込んだ音声（またはプロジェクト）を画面に反映する */
  const openClip = useCallback(
    (clip: Clip, name: string, project: Project | null, ids?: string[]) => {
      // 拡張子は除く（以前のプロジェクトファイルは、拡張子付きの名前を持っていた）
      setFileName(name.replace(/\.[^.]+$/, ''))
      setNamed(!!project?.named)
      // 古いプロジェクト（テンポを持たない）と新しい素材は既定のテンポから（新しい素材は下で解析する）
      setProjectTempoState(project?.tempo ?? defaultTempo)
      markers.reset(project?.markers)
      // プロジェクトはトラックごとに。自動保存から戻すときは保存先の ID を引き継ぐ（保存し直さずに済む）
      const list = project
        ? project.tracks.map((tr, i) => ({ id: ids?.[i] || newTrackId(), name: tr.name, original: tr.original, clip: tr.edited }))
        : [makeTrack(name, clip)]
      history.reset(list, list[project ? project.active : 0].id)
      // フェーダー・鳴らし方・重ねる表示は、プロジェクトに保存した値から（新しいファイルは既定値）
      const saved = project?.tracks ?? []
      tracks.restoreSettings(Object.fromEntries(saved.map((tr, i) => [list[i].id, fromStoredSettings(tr)])))
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
      setGrabMode(false)
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
            setToast({ severity: 'info', message: t('toast.tempoDetected', { bpm: Math.round(best.bpm * 100) / 100 }) })
          },
          fail('toast.tempoFailed'),
        )
      }
      if (!project && settings.initialMode !== 'auto') {
        setParams((p) => ({ ...p, ...modes[settings.initialMode as Mode] }))
      } else if (!project) {
        void detectMode(clip)
          .then(({ mode }) => {
            setAutoMode(mode)
            setParams((p) => ({ ...p, ...modes[mode] }))
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
          // 選ぶ画面などから開いたプロジェクトは、保存で上書きする
          projectFileRef.current = project ? (fileRefOf(file) ?? null) : null
          if (project) openClip(project.tracks[project.active].edited, project.fileName, project)
          else if (clip) openClip(clip, file.name, null)
        } catch (e) {
          if (!signal.aborted) setToast({ severity: 'error', message: t('toast.loadFailed', { file: file.name, error: String(e) }) })
        }
      }, 'load'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClip],
  )

  // 加工の適用、テンポの伸縮、曲線の書き込みなど（editActions.ts）
  const { apply, changeTempo, stretchRange, retime, placeOnMidi, kanaDemo, applyCurve, applyGain, applyFormant } = editActions({
    task, history, tracks, edited, shown, editRanges, multi, preview, params, setParams, commit, selections, setSelections,
    setToast, projectTempo, setProjectTempo, settings, pitch, pitchTarget, gainCurve, formantCurve,
  })

  // プロジェクトの保存と書き出し
  const projectFileRef = useRef<SavedFile | null>(null)
  const [, setSavedTick] = useState(0)
  const { baseName, exportName, saveProjectFile, exportFile, renderClip } = useOutput({
    fileName,
    named,
    params,
    tempo: projectTempo,
    markers: markers.markers,
    history,
    tracks,
    selections,
    task,
    notify: (message) => setToast({ severity: 'success', message }),
    closeExport: () => setExportOpen(false),
    onSaved: () => {
      savedTracksRef.current = history.tracks
      // 名前の * を消すため描き直す
      setSavedTick((n) => n + 1)
    },
    projectFile: projectFileRef,
    exportToFolder: canSaveToFolder(),
    finish: { normalize: settings.exportNormalize, fadeMs: settings.exportFadeMs },
  })
  // 動画として書き出す（追加機能「変換」）
  const video = useVideoExport({
    present: history.present,
    renderClip,
    prefs: settings.exportVideo,
    task,
    ensure: addons.ensure,
    exportToFolder: canSaveToFolder(),
    notify: (message) => setToast({ severity: 'success', message }),
  })

  // 閉じるときの保存確認（自動保存を切っていて、PWA として開いているとき。設定の「全般」）。
  // 未保存の変更 = 開いてから、または最後に保存・書き出ししてから、操作履歴が変わったか（マーカーやテンポだけの変更は含めない）
  const savedTracksRef = useRef(history.tracks)
  // 開いた直後（元に戻す・やり直す操作がない）は保存済みとみなす
  if (!history.canUndo && !history.canRedo) savedTracksRef.current = history.tracks
  const dirty = history.tracks.length > 0 && history.tracks !== savedTracksRef.current
  useLeaveGuard(settings.confirmClose && !settings.autoRestore && isStandalone(), () => dirty)
  // タイトルバーにもプロジェクト名と、未保存なら * を出す
  useEffect(() => {
    // PWA の窓はアプリ名を自分で付けるので、名前だけにする（付けると「WeVocalSynth - 名前 - WeVocalSynth」になる）
    const name = `${dirty ? '* ' : ''}${fileName}`
    document.title = !fileName ? APP_TITLE : isStandalone() ? name : `${name} - ${APP_TITLE}`
  }, [fileName, dirty])

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

  // 保存・開く場所の選択、最近使用したファイル、ファイル選択の方式の設定を反映する。
  // 描画中に反映する（メニューや最近使用したファイルの表示が、最初の描画から設定に合うように。値を入れるだけなので軽い）
  const { rememberFolder, startFolder, recentFiles, filePicker } = settings
  configureFileAccess({ rememberFolder, startFolder, recentFiles, pickerMode: filePicker })
  const picker = useFilePicker(`${AUDIO_ACCEPT},${PROJECT_EXT}`, (f) => void loadFile(f), t('file.openType'))
  const recent = useRecentFiles(
    (f) => void loadFile(f),
    (name) => setToast({ severity: 'error', message: t('toast.recentMissing', { file: name }) }),
  )
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
    }, 'load')
  const addPicker = useFilePicker(AUDIO_ACCEPT, addTrackFile, t('file.audioType'))
  // ドロップした音声は、もう開いているならトラックとして足す（プロジェクトファイルは開き直す）
  useFileDrop((f) => (history.tracks.length && !isProjectFile(f) ? addTrackFile(f) : void loadFile(f)))

  // 起動時の復元、ファイルから起動、メモリが足りないときの抽出から戻る（useStartup.ts）
  useStartup({
    autoRestore: settings.autoRestore,
    state: { fileName, named, tempo: projectTempo, markers: markers.markers, tracks: history.tracks, activeId: history.activeId, settings: tracks.settings },
    params, openClip, loadFile, setToast,
    applyVocalParams: () => setParams((p) => ({ ...p, ...modes.vocal })),
  })

  // 書き出しのダイアログ。`activeOnly` ならそのトラックだけを対象にして開く（トラックの右クリックから）
  const [exportActiveOnly, setExportActiveOnly] = useState(false)
  const openExport = (activeOnly = false) => {
    if (!edited) return
    setExportActiveOnly(activeOnly)
    setExportOpen(true)
  }

  const selectAll = () => edited && setSelections([{ start: 0, end: clipDuration(edited) }])
  const clearSelection = () => setSelections([])
  /** 再生位置にマーカーを足す / 前後のマーカーへ移る */
  const addMarker = () => shown && markers.add(player.livePosition())
  const seekMarker = (dir: -1 | 1) => {
    const m = markers.neighbor(player.livePosition(), dir)
    if (m) player.seek(m.time)
  }

  // 矢印キー・Home / End での再生位置の移動
  // 区間ごとのテンポ（プロジェクトのテンポと、テンポを持つマーカー）
  const tempoSegs = useMemo(() => tempoSegments(projectTempo, markers.markers), [projectTempo, markers.markers])
  const { seekBy, seekEdge } = useSeek({ shown, duration, showBeatGrid: settings.showBeatGrid, segments: tempoSegs, getPosition: player.livePosition, seek: player.seek })

  // ショートカットと、フォーカスしている帯に効く切り取りなど（useEditorKeys.ts）
  const { keymap, clip } = useEditorKeys({
    settings, edited, editing, busy, pitch, pitchTarget, pitchTools, showPitch, focusLane, cmd, selections, setSelections, setParams,
    player, playback, history, picker, saveProjectFile, openExport, selectAll, clearSelection, addMarker, seekMarker, seekBy, seekEdge, setToast,
  })

  return {
    keymap,
    // 素材と履歴
    fileName, projectTempo, tempoSegs, setProjectTempo, changeTempo, setProjectName: (name: string) => {
      if (!name.trim()) return
      setFileName(name.trim())
      setNamed(true)
    }, original, edited, shown, duration, editing, source, setSource, history, commit,
    // 処理状態と通知
    busy, progress, taskLabel: task.label, cancelTask: task.cancel, toast, setToast,
    // 選択範囲
    selections, selection, setSelections, selectAll, clearSelection, editRanges, multi,
    // 加工パラメータ
    params, setParams, autoMode, rangeNote, modes,
    // 再生
    player, preview, loop, playback, repeat, setRepeat, seekEdge,
    // 表示（ピッチ・スペクトログラム）とピッチ描画
    showPitch, setShowPitch, showSpec, setShowSpec: requestShowSpec, analyzerInstalled, showWave, setShowWave, showGain, setShowGain, gainCurve, applyGain, showFormant, setShowFormant, formantCurve, applyFormant, focusLane, setFocusLane, clip, penMode, setPenMode, grabMode, setGrabMode, pitch, voicing, spec, pitchTarget, pitchTools, tempo,
    // 操作
    tracks, addPicker, addSynth, gainDb, setGainDb, pan, setPan,
    cmd, apply, stretchRange, retime, placeOnMidi, markers, addMarker, seekMarker, extract: vocal.extract, splitStems: vocal.splitStems, splitLeadStems: vocal.splitLeadStems, splitVoices, kanaDemo, addonDialog: addons.dialog, extractDialog: vocal.dialog, applyCurve, saveProjectFile, dirty, exportFile, exportOpen, openExport, video, exportActiveOnly, setExportOpen, baseName, exportName, picker, recent,
  }
}
