import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { PevenProvider, preventPageZoom } from 'pevenmui'
import App from './App.tsx'
import CleanExtractScreen from './components/CleanExtractScreen'
import { checkCleanBoot, pendingCleanJob } from './project/cleanExtract'
import { clearOffloaded } from './audio/originalStore'

preventPageZoom()

// メモリが足りないときの抽出が予約されていれば、作業を開く前にそれだけを行う（project/cleanExtract.ts）
// 前回退避した原音の残り（閉じたときに置いたままのもの）も、ここで消す
void Promise.all([pendingCleanJob(), checkCleanBoot(), clearOffloaded()]).then(([job]) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PevenProvider>{job ? <CleanExtractScreen job={job} /> : <App />}</PevenProvider>
    </StrictMode>,
  ),
)
