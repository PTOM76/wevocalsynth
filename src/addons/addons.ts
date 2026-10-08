import type { MessageKey } from '../i18n/i18n'
import { t } from '../i18n/i18n'
import { createAddons, type AddonInfo, type AddonsContextValue } from 'pevenmui'
import { idb } from '../project/idb'
import { app } from '../appConfig'

/** 追加機能（アドオン）。仕組みは PevenMUI（pevenmui/src/addons/）。ここは配信している一覧と、このアプリでの呼び名 */

export const ADDONS: AddonInfo<MessageKey>[] = [
  { id: 'vocal-extractor', name: 'addon.vocalExtractor' },
  // ONNX Runtime の wasm。WebGPU で動かすなら gpu、CPU なら cpu を入れる（src/audio/vocalExtract.ts）
  { id: 'vocal-extractor-gpu', name: 'addon.runtimeGpu', requires: ['vocal-extractor'], companion: true },
  { id: 'vocal-extractor-cpu', name: 'addon.runtimeCpu', requires: ['vocal-extractor'], companion: true },
  { id: 'spleeter-fp16', name: 'addon.spleeterFp16', shortName: 'addon.modelLight', requires: ['vocal-extractor'] },
  { id: 'spleeter-int8', name: 'addon.spleeterInt8', shortName: 'addon.modelStandard', requires: ['vocal-extractor'] },
  { id: 'spleeter-fp32', name: 'addon.spleeterFp32', shortName: 'addon.modelPrecise', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-voc-ft', name: 'addon.uvrVocFt', shortName: 'addon.modelVocalHq', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-inst-hq4', name: 'addon.uvrInstHq4', shortName: 'addon.modelInstHq', requires: ['vocal-extractor'] },
  { id: 'uvr-mdx-kara2', name: 'addon.uvrKara2', shortName: 'addon.modelLead', requires: ['vocal-extractor'] },
  // 楽器ごとに分ける（Demucs。モデルは 100MB を超えるので、分けて置いてある。src/audio/vocalExtract.ts）
  { id: 'demucs-4', name: 'addon.demucs4', shortName: 'addon.modelStems4', requires: ['vocal-extractor'] },
  { id: 'demucs-6', name: 'addon.demucs6', shortName: 'addon.modelStems6', requires: ['vocal-extractor'] },
  // 解析（analyzer/ の WeVocalAnalyzer）。今はスペクトログラムの表示に使う（src/audio/spectrogram.ts）
  { id: 'analyzer', name: 'addon.analyzer' },
  // 歌詞の文字化（analyzer/ の src/lyrics.ts。Analyzer と同じもの。一音ずつの切り出しに使う予定。memo/kana-cut.md）
  { id: 'analyzer-lyrics', name: 'addon.lyrics' },
  // 変換（converter/ の WeVocalConverter）。今は動画の書き出しに使う（src/audio/video.ts）
  { id: 'converter', name: 'addon.converter' },
]

const addons = createAddons({ appId: app.id, idb, addons: ADDONS, base: import.meta.env.BASE_URL })

/** 部品とフックが使う追加機能（main.tsx の AddonsContext に入れる） */
export const addonsContext: AddonsContextValue = {
  addons,
  nameOf: (id, short) => {
    const info = ADDONS.find((a) => a.id === id)
    return info ? t((short && info.shortName) || info.name) : id
  },
}

/** 保存先の名前（Cache Storage） */
export const ADDON_CACHE = addons.cacheName
export const addonFolder = addons.folder
export const {
  withRequires,
  installedManifest,
  addonFileUrl,
  fetchManifest,
  notifyAddonsChanged,
  onAddonsChanged,
  uninstallWithUnused,
  installedAddonsSize,
  clearAddons,
  loadAddon,
} = addons
export { addonSize, addonsSupported, type AddonManifest } from 'pevenmui'
