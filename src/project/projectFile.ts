import type { Clip } from '../audio/types'
import type { EditParams } from '../components/EditPanel'
import { t } from '../i18n/i18n'

/**
 * プロジェクトファイル（.wvsp）。gzip で圧縮した次の並び:
 *   "WVSP"（4バイト）| ヘッダ JSON の長さ（u32 LE）| ヘッダ JSON（UTF-8）| 音声データ
 * 音声データは原音・加工後の順に、各クリップのチャンネルを順に並べた f32 LE。
 * 元に戻す履歴は保存しない（音声を丸ごと持つためファイルが大きくなりすぎる）。
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

export const isProjectFile = (file: File) => file.name.toLowerCase().endsWith(PROJECT_EXT)

async function transform(data: Blob, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(data.stream().pipeThrough(stream)).arrayBuffer()
}

/** プロジェクトを .wvsp の Blob にする */
export async function saveProject(p: Project): Promise<Blob> {
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
  // 端末のバイト順に依存しないよう、f32 は明示的にリトルエンディアンで書く
  const pcm = clips.flatMap((c) =>
    c.channels.map((ch) => {
      const buf = new DataView(new ArrayBuffer(ch.length * 4))
      for (let i = 0; i < ch.length; i++) buf.setFloat32(i * 4, ch[i], true)
      return buf.buffer
    }),
  )
  const raw = new Blob([lead, json, ...pcm])
  return new Blob([await transform(raw, new CompressionStream('gzip'))], { type: 'application/octet-stream' })
}

/** .wvsp ファイルを読み込む。形式が違えば例外 */
export async function loadProject(file: File): Promise<Project> {
  const buf = await transform(file, new DecompressionStream('gzip')).catch(() => {
    throw new Error(t('project.invalid'))
  })
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
      const ch = new Float32Array(info.length)
      for (let i = 0; i < info.length; i++) ch[i] = view.getFloat32(offset + i * 4, true)
      offset += info.length * 4
      return ch
    }),
  }))
  return { fileName: header.fileName, original, edited, params: header.params }
}
