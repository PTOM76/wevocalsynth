// プロジェクトファイル（.wvsp）の読み書き
import { readWvsp, writeWvsp, WVSP_EXT, WvspError } from 'wevocal-lib'
import type { Clip } from '../audio/types'
import { pickStoredSettings, type StoredTrackSettings } from '../audio/tracks'
import type { EditParams } from '../components/EditPanel'
import { t } from '../i18n/i18n'

/**
 * プロジェクトファイル（.wvsp。docs/PROJECT_FORMAT.md）。読み書きの本体は wevocal-lib の `readWvsp` / `writeWvsp`
 * （WeVocalAnalyzer も同じものを使う）。ここでは Synth の型との受け渡しと、エラーの文言を受け持つ。
 * 元に戻す履歴は保存しない（音声を丸ごと持つためファイルが大きくなりすぎる）
 */
export const PROJECT_EXT = WVSP_EXT

/** プロジェクトの1トラック */
/** プロジェクトの1トラック。フェーダー・鳴らし方・重ねる表示（`StoredTrackSettings`）は古いファイルには無い */
export interface ProjectTrack extends StoredTrackSettings {
  name: string
  original: Clip
  edited: Clip
}

/** プロジェクトのテンポ（拍の線・拍への吸着・ビブラートの速さなどに使う） */
export interface ProjectTempo {
  bpm: number
  /** 1小節の拍数 */
  beatsPerBar: number
  /** 1拍目の位置（秒）。曲の頭に無音があるときに合わせる */
  beatOffset: number
}
export const DEFAULT_TEMPO: ProjectTempo = { bpm: 120, beatsPerBar: 4, beatOffset: 0 }

/** 位置に付ける名前付きの目印（全トラック共通） */
export interface Marker {
  id: string
  /** 位置（秒） */
  time: number
  name: string
  /** ここからのテンポ（テンポが途中で変わる曲。なければ前のテンポのまま。`audio/tempoMap.ts`） */
  tempo?: { bpm: number; beatsPerBar: number }
}

export interface Project {
  /** プロジェクト名 */
  fileName: string
  /** プロジェクト名を自分で変えたか（変えていなければ、書き出しの名前に _wevocal を付ける）。古いファイルには無い */
  named?: boolean
  params: EditParams
  /** テンポ。古いファイルには無い（以前はアプリの設定に持っていた） */
  tempo?: ProjectTempo
  /** マーカー。古いファイルには無い */
  markers?: Marker[]
  tracks: ProjectTrack[]
  /** 編集していたトラックの位置 */
  active: number
}

/** ヘッダのトラックの情報（名前と、音声以外の状態） */
type TrackInfo = { name: string } & StoredTrackSettings

/** ヘッダのトラック情報のうち、音声以外（フェーダー・鳴らし方・重ねる表示） */
const pickTrackState = pickStoredSettings

export const isProjectFile = (file: File) => file.name.toLowerCase().endsWith(PROJECT_EXT)

/** プロジェクトを .wvsp の Blob にする（加工後が原音と同じなら中身を書かない） */
export function saveProject(p: Project): Blob {
  return writeWvsp<TrackInfo>(
    { fileName: p.fileName, named: p.named, params: p.params, tempo: p.tempo, markers: p.markers, active: p.active },
    p.tracks.map((t) => ({ info: { name: t.name, ...pickStoredSettings(t) }, original: t.original, edited: t.edited })),
  )
}

/** .wvsp ファイルを読み込む。形式が違えば、文言の付いた例外 */
export async function loadProject(file: File, onProgress?: (p: number) => void): Promise<Project> {
  try {
    const { header, tracks, active } = await readWvsp<TrackInfo>(file, onProgress)
    return {
      fileName: header.fileName,
      named: header.named as boolean | undefined,
      params: header.params as EditParams,
      tempo: header.tempo as ProjectTempo | undefined,
      markers: header.markers as Marker[] | undefined,
      tracks: tracks.map((t) => ({ name: t.info.name, original: t.original, edited: t.edited, ...pickTrackState(t.info) })),
      active,
    }
  } catch (e) {
    if (e instanceof WvspError) throw new Error(t(e.code === 'unsupported' ? 'project.unsupported' : 'project.invalid'))
    throw e
  }
}
