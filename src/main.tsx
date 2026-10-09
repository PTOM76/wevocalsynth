// 起動（設定の Provider と App。メモリが足りないときの抽出から戻ったとき、ウィンドウの数が上限のときは、その画面）
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { AddonsContext, PevenProvider, preventPageZoom } from 'pevenmui'
import App from './App.tsx'
import CleanExtractScreen from './components/CleanExtractScreen'
import { checkCleanBoot, pendingCleanJob } from './project/cleanExtract'
import { clearOffloaded } from './audio/originalStore'
import { setPeaksOnBuild } from 'wevocal-lib'
import { markActivity } from './debug/debugStats'
import { app } from './appConfig'
import { SettingsProvider, loadSettings } from './settings/settings'
import { acquireSlot } from './project/windowSlot'
import WindowLimitScreen from './components/WindowLimitScreen'
import { addonsContext } from './addons/addons'

preventPageZoom()
// 波形の表を作ったことを、画面が止まったときの原因探しに残す
setPeaksOnBuild(() => markActivity('peaks build'))

/** 最初に、このウィンドウの枠を取る（保存先のキーが決まる。project/windowSlot.ts）。上限で、超えて開く設定でなければ作業を開かない */
async function boot() {
  const settings = loadSettings()
  const slot = await acquireSlot(settings.maxWindows)
  if (slot === null && !settings.extraWindows) return { job: null, limit: true }
  // メモリが足りないときの抽出が予約されていれば、作業を開く前にそれだけを行う（project/cleanExtract.ts）
  // 前回退避した原音の残り（閉じたときに置いたままのもの）も、ここで消す
  const [job] = await Promise.all([pendingCleanJob(), checkCleanBoot(), clearOffloaded()])
  return { job, limit: false }
}

void boot().then(({ job, limit }) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PevenProvider app={app}>
        {limit ? (
          <WindowLimitScreen />
        ) : job ? (
          <CleanExtractScreen job={job} />
        ) : (
          <AddonsContext.Provider value={addonsContext}>
            <SettingsProvider>
              <App />
            </SettingsProvider>
          </AddonsContext.Provider>
        )}
      </PevenProvider>
    </StrictMode>,
  ),
)
