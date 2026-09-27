import { useColorScheme, useMediaQuery, useTheme, type Theme } from '@mui/material'

/**
 * Canvas は CSS 変数を使えないため、今表示している配色（ライト/ダーク）のパレット値を直接取り出す。
 * 設定で「既定」のときは OS の設定に、ライト/ダークを選んだときはそれに従う
 */
export function usePalette() {
  const theme = useTheme()
  const { mode } = useColorScheme()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = mode === 'dark' || ((mode === 'system' || !mode) && systemDark)
  const schemes = (theme as Theme & { colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>> })
    .colorSchemes
  return { pal: schemes?.[dark ? 'dark' : 'light']?.palette ?? theme.palette, dark, font: theme.typography.fontFamily }
}
