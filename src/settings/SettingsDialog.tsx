import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  IconButton,
  List,
  ListItemButton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faChevronRight, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { useT } from '../i18n/i18n'
import { SearchContext, matchCategories, type Category } from './settingsSearch'
import { NarrowContext } from './controls'
import { settingsPages } from './SettingsPages'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
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

  const pages = settingsPages({ draft, set, onClose, t })

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
