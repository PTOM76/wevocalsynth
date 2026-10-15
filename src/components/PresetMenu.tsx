// 加工のプリセットのメニュー（部品は PevenMUI の PresetMenu。WeVocal Studio と共通）
import { PresetMenu as PevenPresetMenu, type Preset as PevenPreset } from 'pevenmui'
import type { EditParams } from './EditPanel'
import { useT } from '../i18n/i18n'

/** 加工のプリセット（よく使うピッチ、長さ、フォルマント、処理方式の組み合わせ。設定に覚える） */
export type Preset = PevenPreset<EditParams>

/** 加工の欄の「プリセット」。押すと、呼び出し、今の設定の保存、削除のメニュー */
export default function PresetMenu(p: { params: EditParams; presets: Preset[]; onApply: (params: EditParams) => void; onChange: (presets: Preset[]) => void; disabled?: boolean }) {
  const t = useT()
  return <PevenPresetMenu {...p} labels={{ button: t('preset.button'), empty: t('preset.empty'), save: t('preset.save'), remove: t('preset.remove'), defaultName: (n) => t('preset.defaultName', { n }) }} />
}
