import { useState } from 'react'
import { Button } from '@mui/material'
import { ContextMenu, type MenuEntry, pevenFont } from 'pevenmui'
import RenameDialog from './tracks/RenameDialog'
import type { EditParams } from './EditPanel'
import { useT } from '../i18n/i18n'

/** 加工のプリセット（よく使うピッチ、長さ、フォルマント、処理方式の組み合わせ。設定に覚える） */
export interface Preset {
  name: string
  params: EditParams
}

/** 加工の欄の「プリセット」。押すと、呼び出し、今の設定の保存、削除のメニュー */
export default function PresetMenu(p: { params: EditParams; presets: Preset[]; onApply: (params: EditParams) => void; onChange: (presets: Preset[]) => void; disabled?: boolean }) {
  const t = useT()
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  // 保存するときの名前の入力（null なら閉じている）
  const [naming, setNaming] = useState<string | null>(null)
  const entries: MenuEntry[] = [
    ...(p.presets.length ? p.presets.map((pr): MenuEntry => ({ label: pr.name, onClick: () => p.onApply(pr.params) })) : [{ label: t('preset.empty'), disabled: true, onClick: () => {} }]),
    { divider: true },
    { label: t('preset.save'), onClick: () => setNaming(t('preset.defaultName', { n: p.presets.length + 1 })) },
    {
      label: t('preset.remove'),
      disabled: !p.presets.length,
      submenu: p.presets.map((pr, i): MenuEntry => ({ label: pr.name, onClick: () => p.onChange(p.presets.filter((_, j) => j !== i)) })),
    },
  ]
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={p.disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenuAt({ x: r.left, y: r.bottom })
        }}
        sx={{ minWidth: 0, height: 24, px: 1, fontSize: pevenFont('md') }}
      >
        {t('preset.button')}
      </Button>
      <ContextMenu position={menuAt} entries={entries} onClose={() => setMenuAt(null)} />
      <RenameDialog
        name={naming}
        title={t('preset.save')}
        onClose={() => setNaming(null)}
        // 同じ名前があれば置き換える
        onRename={(name) => p.onChange([...p.presets.filter((pr) => pr.name !== name.trim()), { name: name.trim(), params: p.params }])}
      />
    </>
  )
}
