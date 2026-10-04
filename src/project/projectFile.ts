import type { Clip } from '../audio/types'
import { pickStoredSettings, type StoredTrackSettings } from '../audio/tracks'
import type { EditParams } from '../components/EditPanel'
import { t } from '../i18n/i18n'

/**
 * プロジェクトファイル（.wvsp）。次の並び（圧縮しない）:
 *   "WVSP"（4バイト）| ヘッダ JSON の長さ（u32 LE）| ヘッダ JSON（UTF-8）| 音声データ
 * 音声データはトラックごとに原音・加工後の順に、各クリップのチャンネルを順に並べた f32 LE。
 * 版 1 はトラックが1本だけだった（原音・加工後の2クリップ）。読み込むときは1トラックとして扱う。
 * 元に戻す履歴は保存しない（音声を丸ごと持つためファイルが大きくなりすぎる）。
 * 以前は gzip で圧縮していたが、音声はほとんど縮まず（約1割）、3分の音声で保存に数秒かかったためやめた。
 * 圧縮された古いファイルも読み込める。
 */
export const PROJECT_EXT = '.wvsp'
const MAGIC = 'WVSP'
const VERSION = 3

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

/** `same`: 中身を書かず、直前のクリップ（そのトラックの原音）と同じ。版 3 から */
type ClipInfo = { sampleRate: number; channels: number; length: number; same?: boolean }

interface Header {
  version: number
  fileName: string
  named?: boolean
  params: EditParams
  tempo?: ProjectTempo
  markers?: Marker[]
  /** 版 2・3: トラックごとの名前。クリップは2つずつ（原音・加工後）並ぶ */
  tracks?: ({ name: string } & StoredTrackSettings)[]
  active?: number
  clips: ClipInfo[]
}

/**
 * f32 はリトルエンディアンで保存する。ブラウザが動く環境（x86 / ARM）はほぼリトルエンディアンなので、
 * その場合はメモリのバイト列をそのまま使う（1サンプルずつ変換すると3分の音声で数秒かかり画面が固まる）
 */
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

function toLittleEndian(ch: Float32Array): ArrayBuffer {
  if (LITTLE_ENDIAN) return ch.slice().buffer
  const v = new DataView(new ArrayBuffer(ch.length * 4))
  for (let i = 0; i < ch.length; i++) v.setFloat32(i * 4, ch[i], true)
  return v.buffer
}

/** 1 チャンネル分のバイト列（f32 LE）を Float32Array にする */
function fromLittleEndian(buf: ArrayBuffer): Float32Array {
  if (LITTLE_ENDIAN) return new Float32Array(buf)
  const v = new DataView(buf)
  const ch = new Float32Array(buf.byteLength / 4)
  for (let i = 0; i < ch.length; i++) ch[i] = v.getFloat32(i * 4, true)
  return ch
}

/** ヘッダのトラック情報のうち、音声以外（フェーダー・鳴らし方・重ねる表示） */
const pickTrackState = pickStoredSettings

export const isProjectFile = (file: File) => file.name.toLowerCase().endsWith(PROJECT_EXT)

async function transform(data: Blob, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(data.stream().pipeThrough(stream)).arrayBuffer()
}

/** プロジェクトを .wvsp の Blob にする */
export function saveProject(p: Project): Blob {
  // 加工後が原音と同じなら中身を書かない
  const clips = p.tracks.flatMap((t) => [
    { clip: t.original, same: false },
    { clip: t.edited, same: t.edited === t.original },
  ])
  const header: Header = {
    version: VERSION,
    fileName: p.fileName,
    named: p.named,
    params: p.params,
    tempo: p.tempo,
    markers: p.markers,
    tracks: p.tracks.map((t) => ({ name: t.name, ...pickStoredSettings(t) })),
    active: p.active,
    clips: clips.map(({ clip: c, same }) => ({ sampleRate: c.sampleRate, channels: c.channels.length, length: c.channels[0].length, ...(same ? { same } : {}) })),
  }
  const json = new TextEncoder().encode(JSON.stringify(header))
  const lead = new Uint8Array(8)
  lead.set(new TextEncoder().encode(MAGIC), 0)
  new DataView(lead.buffer).setUint32(4, json.length, true)
  const pcm = clips.flatMap(({ clip, same }) => (same ? [] : clip.channels.map(toLittleEndian)))
  return new Blob([lead, json, ...pcm], { type: 'application/octet-stream' })
}

/**
 * .wvsp ファイルを読み込む。形式が違えば例外。
 * チャンネルごとにファイルの必要な部分だけを読む（全体を読んでから切り出すと、一時的にファイルの 2 倍のメモリを使った）
 */
export async function loadProject(file: File, onProgress?: (p: number) => void): Promise<Project> {
  // 先頭が gzip の印（1f 8b）なら、以前の圧縮形式として展開する（全体を読む）
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const gzipped = head[0] === 0x1f && head[1] === 0x8b
  const whole = gzipped
    ? await transform(file, new DecompressionStream('gzip')).catch(() => {
        throw new Error(t('project.invalid'))
      })
    : null
  const source: Blob = whole ? new Blob([whole]) : file
  const lead = whole ? new Uint8Array(whole, 0, Math.min(8, whole.byteLength)) : head
  if (lead.byteLength < 8 || new TextDecoder().decode(lead.subarray(0, 4)) !== MAGIC) throw new Error(t('project.invalid'))
  const jsonLen = new DataView(lead.buffer, lead.byteOffset, 8).getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(await source.slice(8, 8 + jsonLen).arrayBuffer())) as Header
  const infos = header.version === 1 ? [{ name: header.fileName }] : header.version === 2 || header.version === 3 ? (header.tracks ?? []) : null
  const names = infos?.map((tr) => tr.name) ?? null
  if (!names || header.clips.length !== names.length * 2 || names.length === 0) throw new Error(t('project.unsupported'))

  const total = header.clips.reduce((s, c) => s + (c.same ? 0 : c.channels * c.length * 4), 0) || 1
  let offset = 8 + jsonLen
  let read = 0
  const clips: Clip[] = []
  for (const info of header.clips) {
    if (info.same && clips.length) {
      clips.push(clips[clips.length - 1])
      continue
    }
    const channels: Float32Array[] = []
    for (let c = 0; c < info.channels; c++) {
      const bytes = info.length * 4
      const buf = await source.slice(offset, offset + bytes).arrayBuffer()
      if (buf.byteLength !== bytes) throw new Error(t('project.invalid'))
      channels.push(fromLittleEndian(buf))
      offset += bytes
      read += bytes
      onProgress?.(read / total)
    }
    clips.push({ sampleRate: info.sampleRate, channels })
  }
  const tracks = names.map((name, i) => ({ name, original: clips[i * 2], edited: clips[i * 2 + 1], ...pickTrackState(infos?.[i]) }))
  return { fileName: header.fileName, named: header.named, params: header.params, tempo: header.tempo, markers: header.markers, tracks, active: Math.min(header.active ?? 0, tracks.length - 1) }
}