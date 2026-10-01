import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { PevenProvider, preventPageZoom } from 'pevenmui'
import App from './App.tsx'

preventPageZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PevenProvider>
      <App />
    </PevenProvider>
  </StrictMode>,
)
