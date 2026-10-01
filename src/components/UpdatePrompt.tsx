import { useEffect, useState } from 'react'
import { Alert, Button, Snackbar } from '@mui/material'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useT } from '../i18n/i18n'
import { APP_BUILD, fetchLatestBuild, setRegistration } from '../pwa/updateCheck'

/** 開いたままでも新しい版に気づけるよう、更新を確認する間隔（ミリ秒） */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * 新しい版が公開されたときの通知。勝手に入れ替えると作業中に再読み込みされるため、
 * 利用者が「更新」を押したときだけ切り替える（作業は自動保存から復元される）
 */
export default function UpdatePrompt() {
  const t = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setRegistration(registration)
      const check = () => void registration.update().catch(() => {})
      setInterval(check, CHECK_INTERVAL_MS)
      // iPad などのホーム画面の PWA は、開き直しても読み込み直さず続きから表示されることが多く、
      // 裏にいる間はタイマーも止まる。画面に戻ってきたときにも確認する
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  // 新しい Service Worker が来たら、どの版かを取りに行く（バージョン番号が同じでもコミットで見分けられる）。
  // 取り終わるまでは通知を出さない（undefined は取得中、null は取れなかった）
  const [latest, setLatest] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!needRefresh) return setLatest(undefined)
    void fetchLatestBuild().then(setLatest)
  }, [needRefresh])
  // 配信中の版が今動いている版と同じなら通知しない。再読み込みで新しい画面だけ先に読み込んだときなどに、
  // 古い Service Worker の入れ替えだけが残っていることがあり、そのまま通知すると「1.0.5 → 1.0.5」になる
  // （待っている Service Worker は、アプリを閉じたときに入れ替わる）
  const open = needRefresh && latest !== undefined && latest !== APP_BUILD

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      <Alert
        severity="info"
        variant="filled"
        onClose={() => setNeedRefresh(false)}
        action={
          <Button color="inherit" size="small" onClick={() => void updateServiceWorker(true)}>
            {t('update.reload')}
          </Button>
        }
      >
        {t('update.available')}
        {latest && <span className="selectable">{t('update.availableBuild', { from: APP_BUILD, to: latest })}</span>}
      </Alert>
    </Snackbar>
  )
}
