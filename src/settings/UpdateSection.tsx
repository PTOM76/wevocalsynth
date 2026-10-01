import { useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { APP_BUILD, checkForUpdate, type UpdateCheckResult } from '../pwa/updateCheck'
import { useT, type MessageKey } from '../i18n/i18n'

const RESULT_TEXT: Record<UpdateCheckResult, MessageKey> = {
  found: 'update.found',
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
      {result && <Typography sx={{ fontSize: 12, color: result === 'failed' ? 'error.main' : 'text.secondary' }}>{t(RESULT_TEXT[result])}</Typography>}
    </Box>
  )
}
