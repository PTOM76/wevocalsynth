import { createTheme } from '@mui/material'

/**
 * Google 製品寄りの Material Design テーマ。
 * 角丸は控えめ（4px）にして、ツールらしい落ち着いた見た目にする。
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1A73E8' },
        secondary: { main: '#D93025' },
        background: { default: '#F8F9FA', paper: '#FFFFFF' },
        divider: '#DADCE0',
      },
    },
    dark: {
      palette: {
        primary: { main: '#8AB4F8' },
        secondary: { main: '#F28B82' },
        background: { default: '#202124', paper: '#292A2D' },
        divider: '#3C4043',
      },
    },
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: 'Roboto, "Noto Sans JP", "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiChip: { styleOverrides: { root: { borderRadius: 4 } } },
    // メニュー・ダイアログ類の開閉アニメーションは短くする（ツールでは待たされる感じが重さになるため）
    MuiMenu: { defaultProps: { transitionDuration: { enter: 110, exit: 70 } } },
    MuiPopover: { defaultProps: { transitionDuration: { enter: 110, exit: 70 } } },
    MuiDialog: { defaultProps: { transitionDuration: { enter: 140, exit: 90 } } },
    MuiDrawer: { defaultProps: { transitionDuration: { enter: 160, exit: 110 } } },
    MuiTooltip: { defaultProps: { enterDelay: 400, slotProps: { transition: { timeout: 100 } } } },
    // 目盛りを黒系にしない: レール上は primary、バー上は白で描く
    MuiSlider: {
      styleOverrides: {
        mark: ({ theme }) => ({
          width: 2,
          height: 8,
          borderRadius: 0,
          backgroundColor: theme.vars!.palette.primary.main,
        }),
        markActive: {
          backgroundColor: '#FFFFFF',
          opacity: 0.8,
        },
        // ライト/ダークで確実に切り替わるよう色を直接指定する
        markLabel: ({ theme }) => ({
          fontSize: 12,
          color: '#5F6368',
          ...theme.applyStyles('dark', { color: '#BDC1C6' }),
        }),
        markLabelActive: ({ theme }) => ({
          color: '#3C4043',
          ...theme.applyStyles('dark', { color: '#E8EAED' }),
        }),
      },
    },
  },
})
