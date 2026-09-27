import { useMediaQuery, useTheme, type Theme } from '@mui/material'

/** Canvas は CSS 変数を使えないため、現在の配色（ライト/ダーク）のパレット値を直接取り出す */
export function usePalette() {
  const theme = useTheme()
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const schemes = (theme as Theme & { colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>> })
    .colorSchemes
  return { pal: schemes?.[dark ? 'dark' : 'light']?.palette ?? theme.palette, dark, font: theme.typography.fontFamily }
}
