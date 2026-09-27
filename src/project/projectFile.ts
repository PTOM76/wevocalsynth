import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import { t } from '../i18n/i18n'

/**
 * プロジェクトファイル（.wvsp）。次の並び（圧縮しない）:
 *   "WVSP"（4バイト）| ヘッダ JSON の長さ（u32 LE）| ヘッダ JSON（UTF-8）| 音声データ
 * 音声データは原音・加工後の順に、各クリップのチャンネルを順に並べた f32 LE。
 * 元に戻す履歴は保存しない（音声を丸ごと持つためファイルが大きくなりすぎる）。
 * 以前は gzip で圧縮していたが、音声はほとんど縮まず（約1割）、3分の音声で保存に数秒かかったためやめた。
 * 圧縮された古いファイルも読み込める。
 */
export const PROJECT_EXT = '.wvsp'
const MAGIC = 'WVSP'
const VERSION = 1

export interface Project {
  fileName: string
  original: Clip
  edited: Clip
  params: EditParams
}

interface Header {
  version: number
  fileName: string
  params: EditParams
  clips: { sampleRate: number; channels: number; length: number }[]
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

function fromLittleEndian(buf: ArrayBuffer, offset: number, length: number): Float32Array {
  // オフセットが4の倍数とは限らないため、一度切り出してから Float32Array として見る
  if (LITTLE_ENDIAN) return new Float32Array(buf.slice(offset, offset + length * 4))
  const v = new DataView(buf)
  const ch = new Float32Array(length)
  for (let i = 0; i < length; i++) ch[i] = v.getFloat32(offset + i * 4, true)
  return ch
}

export const isProjectFile = (file: File) => file.name.toLowerCase().endsWith(PROJECT_EXT)

async function transform(data: Blob, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(data.stream().pipeThrough(stream)).arrayBuffer()
}

/** プロジェクトを .wvsp の Blob にする */
export function saveProject(p: Project): Blob {
  const clips = [p.original, p.edited]
  const header: Header = {
    version: VERSION,
    fileName: p.fileName,
    params: p.params,
    clips: clips.map((c) => ({ sampleRate: c.sampleRate, channels: c.channels.length, length: c.channels[0].length })),
  }
  const json = new TextEncoder().encode(JSON.stringify(header))
  const lead = new Uint8Array(8)
  lead.set(new TextEncoder().encode(MAGIC), 0)
  new DataView(lead.buffer).setUint32(4, json.length, true)
  const pcm = clips.flatMap((c) => c.channels.map(toLittleEndian))
  return new Blob([lead, json, ...pcm], { type: 'application/octet-stream' })
}

/** .wvsp ファイルを読み込む。形式が違えば例外 */
export async function loadProject(file: File): Promise<Project> {
  // 先頭が gzip の印（1f 8b）なら、以前の圧縮形式として展開する
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  const gzipped = head[0] === 0x1f && head[1] === 0x8b
  const buf = gzipped
    ? await transform(file, new DecompressionStream('gzip')).catch(() => {
        throw new Error(t('project.invalid'))
      })
    : await file.arrayBuffer()
  const view = new DataView(buf)
  if (buf.byteLength < 8 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== MAGIC) {
    throw new Error(t('project.invalid'))
  }
  const jsonLen = view.getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jsonLen))) as Header
  if (header.version !== VERSION || header.clips.length !== 2) throw new Error(t('project.unsupported'))

  let offset = 8 + jsonLen
  const [original, edited] = header.clips.map((info): Clip => ({
    sampleRate: info.sampleRate,
    channels: Array.from({ length: info.channels }, () => {
      const ch = fromLittleEndian(buf, offset, info.length)
      offset += info.length * 4
      return ch
    }),
  }))
  return { fileName: header.fileName, original, edited, params: header.params }
}
