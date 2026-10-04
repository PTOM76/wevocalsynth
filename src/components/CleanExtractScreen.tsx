import { FULL_HEIGHT } from 'pevenmui'
import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import { resolveLang, setLang, t } from '../i18n/i18n'
import { useSettings } from '../settings/settings'
import { cancelCleanJob, runCleanJob, type CleanJob } from '../project/cleanExtract'

/**
 * メモリが足りないときの抽出の画面（再読み込みの直後、作業を開く前に出す）。
 * 進み具合だけを出し、終わったら再読み込みして、結果を反映した作業を開く（project/cleanExtract.ts）
 */
export default function CleanExtractScreen({ job }: { job: CleanJob }) {
  const { settings } = useSettings()
  setLang(resolveLang(settings.language))
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // StrictMode で2回呼ばれても、抽出は1回だけ行う
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    runCleanJob(job, setProgress)
      .then(() => location.reload())
      .catch((e) => setError(String(e)))
  }, [job])

  // やめるときは、抽出しないまま作業を開き直す
  const giveUp = () => void cancelCleanJob().then(() => location.reload())
  return (
    <Stack spacing={2} sx={{ height: FULL_HEIGHT, alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
      <Typography>{t(job.mode === 'split' ? 'task.splitStems' : job.stem === 'vocals' ? 'task.extractVocals' : 'task.extractAccompaniment')}</Typography>
      <Box sx={{ width: 'min(360px, 90vw)' }}>
        <LinearProgress variant="determinate" value={progress * 100} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('extract.cleanHint')}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ maxWidth: 'min(480px, 90vw)' }} className="selectable">
          {t('extract.cleanFailed', { error })}
        </Alert>
      )}
      <Button variant={error ? 'contained' : 'text'} onClick={giveUp}>
        {t(error ? 'extract.cleanBack' : 'task.cancel')}
      </Button>
    </Stack>
  )
}
