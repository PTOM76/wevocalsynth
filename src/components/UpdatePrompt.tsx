import { Alert, Button, Snackbar } from '@mui/material'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useT } from '../i18n/i18n'
import { setRegistration } from '../pwa/updateCheck'

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

  return (
    <Snackbar open={needRefresh} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
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
      </Alert>
    </Snackbar>
  )
}
