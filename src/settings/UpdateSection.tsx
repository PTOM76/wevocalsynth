import { useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { APP_BUILD, checkForUpdate, updateNow, type UpdateCheckResult } from '../pwa/updateCheck'
import { useT, type MessageKey } from '../i18n/i18n'

const RESULT_TEXT: Record<UpdateCheckResult['kind'], MessageKey> = {
  found: 'update.available',
  latest: 'update.latest',
  unsupported: 'update.unsupported',
  failed: 'update.failed',
}

/** 設定の「アップデート」: 今のバージョンと、新しい版の確認ボタン */
export default function UpdateSection() {
  const t = useT()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult | null>(null)

  const check = async () => {
    setChecking(true)
    setResult(null)
    setResult(await checkForUpdate())
    setChecking(false)
  }

  return (
    <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
      <Typography sx={{ fontSize: 13 }}>
        {t('about.version')} <span className="selectable">{APP_BUILD}</span>
      </Typography>
      <Button size="small" variant="outlined" disabled={checking} onClick={() => void check()}>
        {t('update.check')}
      </Button>
      {checking && <CircularProgress size={14} />}
      {/* 結果は次の行に出し、長くても設定の幅の中で折り返す */}
      {result && (
        <Box sx={{ flexBasis: '100%', minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontSize: 12, minWidth: 0, overflowWrap: 'anywhere', color: result.kind === 'failed' ? 'error.main' : 'text.secondary' }}>
            {t(RESULT_TEXT[result.kind])}
            {result.kind === 'found' && result.build && <span className="selectable">{t('update.availableBuild', { from: APP_BUILD, to: result.build })}</span>}
          </Typography>
          {/* 新しい版があれば、ここからそのまま更新できる（作業は自動保存から復元される） */}
          {result.kind === 'found' && (
            <Button size="small" variant="contained" onClick={updateNow}>
              {t('update.reload')}
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
