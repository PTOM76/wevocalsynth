// 配信している追加機能の一覧と、このアプリでの呼び名（導入と読み込みの仕組みは PevenMUI）
import type { MessageKey } from '../i18n/i18n'
import { t } from '../i18n/i18n'
import { createAddons, type AddonInfo, type AddonsContextValue } from 'pevenmui'
import { idb } from '../project/idb'
import { app } from '../appConfig'
import { EXTRACTOR_ADDONS } from '../../extractor/src/host'
import { ANALYZER_ADDONS } from '../../analyzer/src/kanaCut'

/** 追加機能（アドオン）。仕組みは PevenMUI（pevenmui/src/addons/）。ここは配信している一覧と、このアプリでの呼び名 */

export const ADDONS: AddonInfo<MessageKey>[] = [
  // ボーカル抽出の実行環境とモデル（一覧は extractor の host.ts。WeVocal Studio と共通）
  ...EXTRACTOR_ADDONS.map((a) => ({ ...a, requires: 'requires' in a ? [...a.requires] : undefined })),
  // 解析、歌詞の文字化とそのモデル（一覧は analyzer の kanaCut.ts。WeVocal Studio と共通）
  ...ANALYZER_ADDONS.map((a) => ({ ...a, requires: 'requires' in a ? [...a.requires] : undefined })),
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
  addonsSizeIn,
  clearAddonsIn,
} = addons
export { addonSize, addonsSupported, type AddonManifest } from 'pevenmui'
