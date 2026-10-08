// 開いている文書（プロジェクト）: 名前、テンポ、マーカー、トラックと元に戻す、未保存の印、保存先、タイトル（memo/document.md）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLeaveGuard } from 'pevenmui'
import { isStandalone, type SavedFile } from 'pevenmui/web'
import { tempoSegments } from '../audio/tempoMap'
import { fromStoredSettings, makeTrack, newTrackId, toStoredSettings } from '../audio/tracks'
import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import { DEFAULT_TEMPO, type Project, type ProjectTempo } from '../project/projectFile'
import type { Settings } from '../settings/settings'
import { useHistory } from './useHistory'
import { useMarkers } from './useMarkers'
import { useTracks } from './useTracks'

/** タイトルバーの名前（index.html の title） */
const APP_TITLE = typeof document === 'undefined' ? '' : document.title

/** 開いている文書。保存、自動保存、書き出しの名前は、ここから作る */
export function useDocument(settings: Settings) {
  // プロジェクト名。初めは開いたファイルの名前（拡張子を除く）で、変えられる。保存と書き出しのファイル名の初期値になる
  const [fileName, setFileName] = useState('')
  // プロジェクト名を自分で変えたか（変えていなければ、書き出しの名前に _wevocal を付ける）
  const [named, setNamed] = useState(false)
  // プロジェクトのテンポ（BPM、拍子、1 拍目の位置）。自動解析しないときの BPM は設定の既定値
  const defaultTempo: ProjectTempo = { ...DEFAULT_TEMPO, bpm: settings.defaultBpm }
  const [tempo, setTempoState] = useState<ProjectTempo>(defaultTempo)
  const setTempo = useCallback((patch: Partial<ProjectTempo>) => setTempoState((p) => ({ ...p, ...patch })), [])
  const markers = useMarkers()
  // 区間ごとのテンポ（プロジェクトのテンポと、テンポを持つマーカー）
  const tempoSegs = useMemo(() => tempoSegments(tempo, markers.markers), [tempo, markers.markers])
  const history = useHistory({ limit: settings.historyLimit, budgetBytes: settings.historyMemoryMb * 2 ** 20 }, settings.keepOriginal)
  // 編集できるのは選んでいるトラックだけ
  const tracks = useTracks(history)
  // 保存先（選ぶ画面から開いたプロジェクトと、前に保存したファイルは上書きする）
  const fileRef = useRef<SavedFile | null>(null)

  // 未保存の変更 = 開いてから、または最後に保存、書き出ししてから、操作履歴が変わったか（マーカーやテンポだけの変更は含めない）
  const savedTracksRef = useRef(history.tracks)
  const [, setSavedTick] = useState(0)
  // 開いた直後（元に戻す、やり直す操作がない）は保存済みとみなす
  if (!history.canUndo && !history.canRedo) savedTracksRef.current = history.tracks
  const dirty = history.tracks.length > 0 && history.tracks !== savedTracksRef.current
  /** 保存した（名前の * を消すため描き直す） */
  const markSaved = () => {
    savedTracksRef.current = history.tracks
    setSavedTick((n) => n + 1)
  }
  // 閉じるときの保存確認（自動保存を切っていて、PWA として開いているとき。設定の「全般」）
  useLeaveGuard(settings.confirmClose && !settings.autoRestore && isStandalone(), () => dirty)
  // タイトルバーにもプロジェクト名と、未保存なら * を表示する
  useEffect(() => {
    // PWA の窓はアプリ名を自分で付けるので、名前だけにする（付けると「WeVocalSynth - 名前 - WeVocalSynth」になる）
    const name = `${dirty ? '* ' : ''}${fileName}`
    document.title = !fileName ? APP_TITLE : isStandalone() ? name : `${name} - ${APP_TITLE}`
  }, [fileName, dirty])

  /** プロジェクト名を変える（自分で付けた名前として覚える） */
  const rename = (name: string) => {
    if (!name.trim()) return
    setFileName(name.trim())
    setNamed(true)
  }

  /**
   * 開いた音声かプロジェクトで、文書を作り直す。拡張子は除く（以前のプロジェクトファイルは拡張子付きの名前を持っていた）。
   * 自動保存から戻すときは、保存先の ID（`ids`）を引き継ぐ（保存し直さずに済む）
   */
  const reset = (name: string, clip: Clip, project: Project | null, ids?: string[]) => {
    setFileName(name.replace(/\.[^.]+$/, ''))
    setNamed(!!project?.named)
    // 古いプロジェクト（テンポを持たない）と新しい音声は既定のテンポから（新しい音声は useEditor が解析する）
    setTempoState(project?.tempo ?? defaultTempo)
    markers.reset(project?.markers)
    const list = project
      ? project.tracks.map((tr, i) => ({ id: ids?.[i] || newTrackId(), name: tr.name, original: tr.original, clip: tr.edited }))
      : [makeTrack(name, clip)]
    history.reset(list, list[project ? project.active : 0].id)
    // フェーダー、鳴らし方、重ねる表示は、プロジェクトに保存した値から（新しいファイルは既定値）
    tracks.restoreSettings(Object.fromEntries((project?.tracks ?? []).map((tr, i) => [list[i].id, fromStoredSettings(tr)])))
  }

  /** プロジェクトファイルの中身（保存と、メモリが足りないときの抽出で使う）。開いていなければ null */
  const project = (params: EditParams) =>
    history.tracks.length
      ? {
          fileName,
          named,
          params,
          tempo,
          markers: markers.markers,
          tracks: history.tracks.map((tr) => ({ name: tr.name, original: tr.original, edited: tr.clip, ...toStoredSettings(tracks.settingsOf(tr.id)) })),
          active: Math.max(0, history.tracks.findIndex((tr) => tr.id === history.activeId)),
        }
      : null

  /** 自動保存に渡す今の状態（トラックの音声は差分で保存するので、トラックの一覧のまま渡す） */
  const autosaveState = { fileName, named, tempo, markers: markers.markers, tracks: history.tracks, activeId: history.activeId, settings: tracks.settings }

  return { fileName, named, rename, tempo, setTempo, tempoSegs, markers, history, tracks, fileRef, dirty, markSaved, reset, project, autosaveState }
}

export type Document = ReturnType<typeof useDocument>
