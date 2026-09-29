import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { createAppTheme } from './theme'
import App from './App.tsx'

/** PC とスマホの境目（MUI の md） */
const DESKTOP_QUERY = '(min-width: 900px)'

/** 画面幅に合わせて PC 用 / スマホ用のテーマを切り替える（テーマができる前なので useMediaQuery は使えない） */
function Root() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const theme = useMemo(() => createAppTheme(desktop), [desktop])
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
}

// アプリとして、スマホでページ全体が拡大縮小されないようにする。
// viewport の user-scalable=no を無視する iOS Safari では、ピンチ操作（gesture*）を打ち消す
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
