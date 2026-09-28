import { useEffect, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { DEFAULT_SETTINGS, type CtrlSAction, type InitialMode, type Settings, type ThemeSetting } from './settings'
import { NumberInput } from '../components/inspector/Inspector'
import { useT, type LangSetting } from '../i18n/i18n'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

type Category = 'general' | 'display' | 'tempo' | 'keys'
const CATEGORIES: Category[] = ['general', 'display', 'tempo', 'keys']

/** 枠線と見出しで項目をまとめる（Windows のグループボックス風） */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="fieldset" sx={{ m: 0, mb: 2, px: 1.5, pt: 0.5, pb: 1.5, border: 1, borderColor: 'divider', borderRadius: 0.5 }}>
      <Typography component="legend" sx={{ px: 0.5, fontSize: 12, color: 'text.secondary' }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
    </Box>
  )
}

/** 左にラベル、右に入力欄の1行 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography sx={{ fontSize: 13, width: 140, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

function Choice<T extends string>(p: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <Select size="small" fullWidth value={p.value} onChange={(e) => p.onChange(e.target.value as T)} sx={{ fontSize: 13, '& .MuiSelect-select': { py: 0.5 } }}>
      {p.options.map(([v, label]) => (
        <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>
          {label}
        </MenuItem>
      ))}
    </Select>
  )
}

function Check(p: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <Box>
      <FormControlLabel
        control={<Checkbox size="small" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />}
        label={p.label}
        slotProps={{ typography: { sx: { fontSize: 13 } } }}
      />
      {p.help && <Typography sx={{ fontSize: 11, color: 'text.secondary', ml: 4, mt: -0.5 }}>{p.help}</Typography>}
    </Box>
  )
}

/**
 * 設定画面。左の分類から選んで右で変える。
 * 変更は「OK」「適用」で反映・保存し、「キャンセル」なら捨てる
 */
export default function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  const t = useT()
  const theme = useTheme()
  const narrow = useMediaQuery(theme.breakpoints.down('sm'))
  const [category, setCategory] = useState<Category>('general')
  const [draft, setDraft] = useState(settings)
  // 開くたびに今の設定から始める
  useEffect(() => {
    if (open) setDraft(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = (Object.keys(draft) as (keyof Settings)[]).some((k) => draft[k] !== settings[k])

  const pages: Record<Category, ReactNode> = {
    general: (
      <>
        <Group title={t('settings.groupStartup')}>
          <Check
            checked={draft.autoRestore}
            onChange={(v) => set({ autoRestore: v })}
            label={t('settings.autoRestore')}
            help={t('settings.autoRestoreHelp')}
          />
        </Group>
        <Group title={t('settings.groupProcess')}>
          <Row label={t('settings.initialMode')}>
            <Choice<InitialMode>
              value={draft.initialMode}
              onChange={(v) => set({ initialMode: v })}
              options={[
                ['auto', t('settings.auto')],
                ['vocal', t('common.vocal')],
                ['instrument', t('common.instrument')],
              ]}
            />
          </Row>
        </Group>
      </>
    ),
    display: (
      <Group title={t('settings.groupAppearance')}>
        <Row label={t('settings.theme')}>
          <Choice<ThemeSetting>
            value={draft.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              ['system', t('settings.themeSystem')],
              ['light', t('settings.themeLight')],
              ['dark', t('settings.themeDark')],
            ]}
          />
        </Row>
        <Row label={t('settings.language')}>
          <Choice<LangSetting>
            value={draft.language}
            onChange={(v) => set({ language: v })}
            options={[
              ['auto', t('settings.languageAuto')],
              ['ja_jp', '日本語'],
              ['en_us', 'English'],
            ]}
          />
        </Row>
      </Group>
    ),
    tempo: (
      <Group title={t('settings.groupTempo')}>
        <Check checked={draft.showBeatGrid} onChange={(v) => set({ showBeatGrid: v })} label={t('settings.showBeatGrid')} />
        <Row label={t('settings.bpm')}>
          <NumberInput value={draft.bpm} onChange={(v) => set({ bpm: v })} min={20} max={400} step={0.01} unit="BPM" width={110} ariaLabel="BPM" />
        </Row>
        <Row label={t('settings.beatsPerBar')}>
          <NumberInput value={draft.beatsPerBar} onChange={(v) => set({ beatsPerBar: Math.round(v) })} min={1} max={16} step={1} width={110} />
        </Row>
        <Row label={t('settings.beatOffset')}>
          <NumberInput value={draft.beatOffset} onChange={(v) => set({ beatOffset: v })} min={0} max={60} step={0.001} unit={t('vibrato.secondUnit')} width={110} />
        </Row>
      </Group>
    ),
    keys: (
      <Group title={t('settings.groupShortcuts')}>
        <Row label={t('settings.ctrlS')}>
          <Choice<CtrlSAction>
            value={draft.ctrlS}
            onChange={(v) => set({ ctrlS: v })}
            options={[
              ['project', t('settings.ctrlSProject')],
              ['export', t('settings.ctrlSExport')],
            ]}
          />
        </Row>
      </Group>
    ),
  }

  const label = (c: Category) => t(`settings.cat.${c}`)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={narrow}>
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('settings.title')}</DialogTitle>
      {narrow && (
        <Tabs value={category} onChange={(_, v: Category) => setCategory(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {CATEGORIES.map((c) => (
            <Tab key={c} value={c} label={label(c)} />
          ))}
        </Tabs>
      )}
      <DialogContent dividers sx={{ display: 'flex', gap: 2, p: narrow ? 2 : 0, minHeight: 320 }}>
        {!narrow && (
          <List dense sx={{ width: 150, flexShrink: 0, borderRight: 1, borderColor: 'divider', py: 0.5 }}>
            {CATEGORIES.map((c) => (
              <ListItemButton key={c} selected={c === category} onClick={() => setCategory(c)} sx={{ fontSize: 13 }}>
                {label(c)}
              </ListItemButton>
            ))}
          </List>
        )}
        <Box sx={{ flex: 1, minWidth: 0, py: narrow ? 0 : 2, pr: narrow ? 0 : 2 }}>{pages[category]}</Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => setDraft(DEFAULT_SETTINGS)} sx={{ mr: 'auto' }}>
          {t('settings.resetAll')}
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            onChange(draft)
            onClose()
          }}
        >
          OK
        </Button>
        <Button size="small" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="small" disabled={!dirty} onClick={() => onChange(draft)}>
          {t('common.apply')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
