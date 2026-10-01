import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  IconButton,
  List,
  ListItemButton,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faChevronRight, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_SETTINGS, type CtrlSAction, type F0Voicing, type InitialMode, type Settings, type ThemeSetting, type VocalModel } from './settings'
import { NumberInput } from '../components/inspector/Inspector'
import UpdateSection from './UpdateSection'
import DataSection from './DataSection'
import AddonSection from './AddonSection'
import { VOCAL_MODELS } from '../hooks/useVocalExtract'
import { useT, type LangSetting } from '../i18n/i18n'
import { SearchContext, matchCategories, useHighlight, type Category } from './settingsSearch'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

/** 設定の「ボーカル抽出」に並べる追加機能（モデル。実行環境はモデルと一緒に導入・削除するので出さない） */
const VOCAL_ADDONS = Object.values(VOCAL_MODELS).map((m) => m.addon)

/** スマホ向けの表示か（項目を縦に積み、文字と操作を大きくする） */
const NarrowContext = createContext(false)

/** 枠線と見出しで項目をまとめる（PC は Windows のグループボックス風、スマホは Android の設定風の見出し） */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const hit = useHighlight(title)
  if (useContext(NarrowContext))
    return (
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'primary.main', mb: 1, width: 'fit-content', ...hit }}>{title}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
      </Box>
    )
  return (
    <Box component="fieldset" sx={{ m: 0, mb: 2, px: 1.5, pt: 0.5, pb: 1.5, border: 1, borderColor: 'divider', borderRadius: 0.5 }}>
      <Typography component="legend" sx={{ px: 0.5, fontSize: 12, color: 'text.secondary', ...hit }}>
        {title}
      </Typography>
      {/* ラベル列は一番長いラベルに合わせ、入力列は残りの幅に収める（長い選択肢は省略表示） */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 360px)', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
        {children}
      </Box>
    </Box>
  )
}

/** 左にラベル、右に入力欄の1行（スマホはラベルの下に入力欄） */
function Row({ label, children }: { label: string; children: ReactNode }) {
  const hit = useHighlight(label)
  if (useContext(NarrowContext))
    return (
      <Box>
        <Typography sx={{ fontSize: 14, mb: 0.75, width: 'fit-content', ...hit }}>{label}</Typography>
        {children}
      </Box>
    )
  return (
    <>
      <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap', justifySelf: 'start', ...hit }}>{label}</Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </>
  )
}

function Choice<T extends string>(p: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  const narrow = useContext(NarrowContext)
  const fontSize = narrow ? 15 : 13
  return (
    <Select size="small" fullWidth value={p.value} onChange={(e) => p.onChange(e.target.value as T)} sx={{ fontSize, minWidth: 0, '& .MuiSelect-select': { py: narrow ? 1.25 : 0.5 } }}>
      {p.options.map(([v, label]) => (
        <MenuItem key={v} value={v} sx={{ fontSize }}>
          {label}
        </MenuItem>
      ))}
    </Select>
  )
}

function Check(p: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  // 項目名か説明文が検索語に一致したら、項目名に色を付ける
  const hit = useHighlight(p.label, p.help)
  // スマホは Android の設定と同じく、行全体を押せる右寄せのスイッチにする
  if (useContext(NarrowContext))
    return (
      <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 14, width: 'fit-content', ...hit }}>{p.label}</Typography>
          {p.help && <Typography className="selectable" sx={{ fontSize: 12, color: 'text.secondary' }}>{p.help}</Typography>}
        </Box>
        <Switch checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      </Box>
    )
  return (
    // 幅 0 + 最小幅 100%: 長い説明文で項目名の列が広がらないようにしつつ、行の幅いっぱいで折り返す
    <Box sx={{ gridColumn: '1 / -1', width: 0, minWidth: '100%' }}>
      <FormControlLabel
        control={<Checkbox size="small" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />}
        label={p.label}
        slotProps={{ typography: { sx: { fontSize: 13, ...hit } } }}
      />
      {p.help && <Typography className="selectable" sx={{ fontSize: 11, color: 'text.secondary', ml: 4, mt: -0.5 }}>{p.help}</Typography>}
    </Box>
  )
}

/**
 * 設定画面。PC は左の分類から選んで右で変え、「OK」「適用」で反映・保存、「キャンセル」なら捨てる。
 * スマホは分類の一覧から各画面へ進み、変更はその場で反映する
 */
export default function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  const t = useT()
  const theme = useTheme()
  const narrow = useMediaQuery(theme.breakpoints.down('sm'))
  const [category, setCategory] = useState<Category>('general')
  // 設定の検索。一致する項目がある分類だけを一覧に出す
  const [query, setQuery] = useState('')
  // 開いたときだけ、選ばれている分類にフォーカスを置く（autoFocus だと、検索で選ばれる分類が変わるたびに検索欄からフォーカスを奪う）
  const tabListRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => tabListRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])
  const shownCategories = matchCategories(query, t)
  // 選んでいた分類が絞り込みで消えたら、残った最初の分類を出す
  const current = shownCategories.includes(category) ? category : (shownCategories[0] ?? category)
  const [draft, setDraft] = useState(settings)
  // 開くたびに今の設定から始める
  useEffect(() => {
    if (open) {
      setDraft(settings)
      setPage(null)
      setQuery('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // スマホで開いている分類の画面（null なら一覧）
  const [page, setPage] = useState<Category | null>(null)
  const set = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (narrow) onChange(patch)
  }
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
        <Group title={t('settings.groupHistory')}>
          <Row label={t('settings.historyLimit')}>
            <NumberInput value={draft.historyLimit} onChange={(v) => set({ historyLimit: Math.round(v) })} min={1} max={500} step={1} width={110} />
          </Row>
          <Row label={t('settings.historyMemory')}>
            <NumberInput value={draft.historyMemoryMb} onChange={(v) => set({ historyMemoryMb: Math.round(v) })} min={64} max={4096} step={64} unit="MB" width={110} />
          </Row>
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
        <Group title={t('settings.groupUpdate')}>
          <UpdateSection />
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
    vocal: (
      <>
        <Group title={t('settings.groupVocal')}>
          <Row label={t('settings.vocalModel')}>
            <Choice<VocalModel>
              value={draft.vocalModel}
              onChange={(v) => set({ vocalModel: v })}
              options={[
                ['fp16', t('addon.modelLight')],
                ['int8', t('addon.modelStandard')],
                ['fp32', t('addon.modelPrecise')],
              ]}
            />
          </Row>
          <Check checked={draft.vocalGpu} onChange={(v) => set({ vocalGpu: v })} label={t('settings.vocalGpu')} help={t('settings.vocalGpuHelp')} />
          <Check
            checked={draft.vocalKeepHighBand}
            onChange={(v) => set({ vocalKeepHighBand: v })}
            label={t('settings.vocalKeepHighBand')}
            help={t('settings.vocalKeepHighBandHelp')}
          />
        </Group>
        <Group title={t('settings.groupAddons')}>
          <AddonSection ids={VOCAL_ADDONS} />
        </Group>
      </>
    ),
    data: (
      <Group title={t('settings.groupData')}>
        <DataSection onClose={onClose} />
      </Group>
    ),

    debug: (
      <>
        <Group title={t('settings.groupDebug')}>
          <Check checked={draft.showDebug} onChange={(v) => set({ showDebug: v })} label={t('settings.showDebug')} help={t('settings.showDebugHelp')} />
        </Group>
        <Group title={t('settings.groupAddonTest')}>
          <AddonSection ids={['test']} />
        </Group>
      </>
    ),
    pitch: (
      <Group title={t('settings.groupPitch')}>
        <Row label={t('settings.f0MinHz')}>
          <NumberInput value={draft.f0MinHz} onChange={(v) => set({ f0MinHz: Math.round(v) })} min={40} max={400} step={1} unit="Hz" width={110} />
        </Row>
        <Row label={t('settings.f0MaxHz')}>
          <NumberInput value={draft.f0MaxHz} onChange={(v) => set({ f0MaxHz: Math.round(v) })} min={200} max={2000} step={10} unit="Hz" width={110} />
        </Row>
        <Row label={t('settings.f0Voicing')}>
          <Choice<F0Voicing>
            value={draft.f0Voicing}
            onChange={(v) => set({ f0Voicing: v })}
            options={[
              ['strict', t('settings.f0Strict')],
              ['normal', t('settings.f0Normal')],
              ['loose', t('settings.f0Loose')],
            ]}
          />
        </Row>
        <Row label={t('settings.f0SilenceDb')}>
          <NumberInput value={draft.f0SilenceDb} onChange={(v) => set({ f0SilenceDb: Math.round(v) })} min={-80} max={-20} step={1} unit="dB" width={110} />
        </Row>
      </Group>
    ),
    tempo: (
      <Group title={t('settings.groupTempo')}>
        <Check checked={draft.autoTempo} onChange={(v) => set({ autoTempo: v })} label={t('settings.autoTempo')} help={t('settings.autoTempoHelp')} />
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

  const searchField = (
    <TextField
      size="small"
      fullWidth
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      // Esc: 入力があればまず検索語を消す（空なら今までどおり設定画面を閉じる）
      onKeyDown={(e) => {
        if (e.key === 'Escape' && query) {
          e.stopPropagation()
          setQuery('')
        }
      }}
      placeholder={t('settings.search')}
      slotProps={{
        htmlInput: { 'aria-label': t('settings.search') },
        input: {
          // PC は右側の選択欄と同じくらいの高さに詰める（スマホは押しやすい既定の高さ）
          sx: { fontSize: narrow ? 15 : 13, '& .MuiInputBase-input': { py: narrow ? undefined : 0.5 } },
          startAdornment: (
            <InputAdornment position="start">
              <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 12, opacity: 0.6 }} />
            </InputAdornment>
          ),
        },
      }}
    />
  )
  const noResults = !shownCategories.length && (
    <Typography sx={{ fontSize: 13, color: 'text.secondary', p: 2 }}>{t('settings.noResults')}</Typography>
  )

  /** 分類の一覧での ↑↓ / Home / End。分類を切り替えて、その項目にフォーカスを移す */
  const moveCategory = (e: React.KeyboardEvent<HTMLElement>) => {
    const list = shownCategories
    const i = list.indexOf(current)
    const next = { ArrowUp: i - 1, ArrowDown: i + 1, Home: 0, End: list.length - 1 }[e.key]
    if (next === undefined || !list.length) return
    e.preventDefault()
    const j = Math.max(0, Math.min(list.length - 1, next))
    setCategory(list[j])
    const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs[j]?.focus()
  }

  // スマホ: Android の設定と同じく、分類の一覧 → 各画面へ進む形。変更はその場で反映し、OK・キャンセルは置かない
  if (narrow)
    return (
      <NarrowContext.Provider value>
        <Dialog open={open} onClose={onClose} fullScreen>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 56, px: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <IconButton aria-label={t('settings.back')} onClick={() => (page ? setPage(null) : onClose())}>
              <FontAwesomeIcon icon={faArrowLeft} />
            </IconButton>
            <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{page ? label(page) : t('settings.title')}</Typography>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {page ? (
              <Box sx={{ p: 2 }}>
                <SearchContext.Provider value={query}>{pages[page]}</SearchContext.Provider>
              </Box>
            ) : (
              <List>
                <Box sx={{ px: 2, pb: 1 }}>{searchField}</Box>
                {noResults}
                {shownCategories.map((c) => (
                  <ListItemButton key={c} onClick={() => setPage(c)} sx={{ py: 1.5 }}>
                    <Typography sx={{ flex: 1, fontSize: 15 }}>{label(c)}</Typography>
                    <FontAwesomeIcon icon={faChevronRight} style={{ opacity: 0.5 }} />
                  </ListItemButton>
                ))}
                <ListItemButton onClick={() => set(DEFAULT_SETTINGS)} sx={{ py: 1.5, mt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: 15, color: 'error.main' }}>{t('settings.resetAll')}</Typography>
                </ListItemButton>
              </List>
            )}
          </Box>
        </Dialog>
      </NarrowContext.Provider>
    )

  return (
    // PC ではカテゴリの一覧と項目を並べても窮屈にならない大きさにする
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 720, height: 'min(600px, calc(100% - 64px))' } } }}>
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('settings.title')}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', gap: 2, p: 0 }}>
        {/* ↑↓ で分類を切り替え、Home / End で最初・最後へ（右の項目へは Tab で移る） */}
        <Box sx={{ width: 180, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1, pb: 0 }}>{searchField}</Box>
          <List ref={tabListRef} dense role="tablist" aria-orientation="vertical" onKeyDown={moveCategory} sx={{ py: 0.5 }}>
          {shownCategories.map((c) => (
            <ListItemButton
              key={c}
              role="tab"
              aria-selected={c === current}
              selected={c === current}
              // 選ばれている分類だけを Tab で止まる場所にする（ほかへは矢印キーで移る）
              tabIndex={c === current ? 0 : -1}
              onClick={() => setCategory(c)}
              sx={{ fontSize: 13 }}
            >
              {label(c)}
            </ListItemButton>
          ))}
          </List>
          {noResults}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, overflowX: 'hidden', py: 2, pr: 2 }}>
          {shownCategories.length > 0 && <SearchContext.Provider value={query}>{pages[current]}</SearchContext.Provider>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => setDraft(DEFAULT_SETTINGS)} sx={{ mr: 'auto' }}>
          {t('settings.resetAll')}
        </Button>
        <Button
          size="small"
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
