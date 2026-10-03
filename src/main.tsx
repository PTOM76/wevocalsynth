import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { PevenProvider, preventPageZoom } from 'pevenmui'
import App from './App.tsx'
import CleanExtractScreen from './components/CleanExtractScreen'
import { checkCleanBoot, pendingCleanJob } from './project/cleanExtract'

preventPageZoom()

// メモリが足りないときの抽出が予約されていれば、作業を開く前にそれだけを行う（project/cleanExtract.ts）
void Promise.all([pendingCleanJob(), checkCleanBoot()]).then(([job]) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PevenProvider>{job ? <CleanExtractScreen job={job} /> : <App />}</PevenProvider>
    </StrictMode>,
  ),
)
