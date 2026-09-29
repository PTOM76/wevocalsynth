import { createTheme } from '@mui/material'

/** メニュー・ダイアログ類の開閉アニメーションの長さ（PC 用。ツールでは待たされる感じが重さになるため短くする） */
const DESKTOP_TRANSITIONS = {
  menu: { enter: 110, exit: 70 },
  dialog: { enter: 140, exit: 90 },
  drawer: { enter: 160, exit: 110 },
}

/**
 * Google 製品寄りの Material Design テーマ。角丸は控えめ（4px）にして、ツールらしい落ち着いた見た目にする。
 * `desktop` のときだけ開閉アニメーションを短くする（スマホは Android の標準の動きのままにする）。
 * ライト/ダークは設定で切り替えられるよう、OS の設定ではなく html のクラスで切り替える
 */
export const createAppTheme = (desktop: boolean) => createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1A73E8' },
        secondary: { main: '#D93025' },
        background: { default: '#F8F9FA', paper: '#FFFFFF' },
        // 白地のメニューでも区切り線が見える濃さにする
        divider: '#C4C7CA',
      },
    },
    dark: {
      palette: {
        primary: { main: '#8AB4F8' },
        secondary: { main: '#F28B82' },
        background: { default: '#202124', paper: '#292A2D' },
        // 背景（#292A2D、メニューは影で少し明るい）に埋もれない明るさにする
        divider: '#5F6368',
      },
    },
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: 'Roboto, "Noto Sans JP", "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    // アプリとして、ボタンやラベルの文字をドラッグで選択してしまわないようにする。
    // 入力欄と、選べた方がよいもの（`.selectable`: ファイル名・リンクなど）だけは選択できる
    MuiCssBaseline: {
      styleOverrides: {
        // ダブルタップ・ピンチでのページ拡大もさせない（波形のピンチは波形側で扱う）
        body: { userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x pan-y' },
        'input, textarea, [contenteditable="true"], .selectable': { userSelect: 'text', WebkitUserSelect: 'text' },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiChip: { styleOverrides: { root: { borderRadius: 4 } } },
    // ページ自体はスクロールしないので、開いたときのスクロールロックは使わない。
    // ロックは <body> に余白を足して画面の幅を変え、波形の Canvas を丸ごと描き直させてしまう
    MuiMenu: { defaultProps: { disableScrollLock: true, ...(desktop && { transitionDuration: DESKTOP_TRANSITIONS.menu }) } },
    MuiPopover: { defaultProps: { disableScrollLock: true, ...(desktop && { transitionDuration: DESKTOP_TRANSITIONS.menu }) } },
    MuiDialog: { defaultProps: { disableScrollLock: true, ...(desktop && { transitionDuration: DESKTOP_TRANSITIONS.dialog }) } },
    MuiDrawer: { defaultProps: { disableScrollLock: true, ...(desktop && { transitionDuration: DESKTOP_TRANSITIONS.drawer }) } },
    MuiTooltip: { defaultProps: { enterDelay: 400, ...(desktop && { slotProps: { transition: { timeout: 100 } } }) } },
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

/**
 * PC のときだけ当てる、デスクトップアプリらしい見た目。
 * 押したときの波紋（ripple）は Web・Android 由来の動きなので消し、アイコンボタンは角ばらせる。
 * 波紋が無いとキーボード操作の位置が分からなくなるため、フォーカス枠を代わりに出す
 */
export const desktopStyles = {
  '.MuiTouchRipple-root': { display: 'none' },
  '.MuiIconButton-root': { borderRadius: 4 },
  '.MuiButton-root, .MuiButton-root:hover': { boxShadow: 'none' },
  '.MuiButtonBase-root.Mui-focusVisible': {
    outline: '2px solid var(--mui-palette-primary-main)',
    outlineOffset: -2,
  },
} as const
