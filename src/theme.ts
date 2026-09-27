import { createTheme } from '@mui/material'

/** Material 3 inspired theme (baseline purple palette, rounded shapes). */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#6750A4' },
        secondary: { main: '#B3261E' },
        background: { default: '#FEF7FF', paper: '#FFFFFF' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#D0BCFF' },
        secondary: { main: '#F2B8B5' },
        background: { default: '#141218', paper: '#211F26' },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Roboto, "Noto Sans JP", "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 20, paddingInline: 20 } } },
    MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: 16 } } },
    MuiToggleButton: { styleOverrides: { root: { borderRadius: 20, paddingInline: 16 } } },
  },
})
