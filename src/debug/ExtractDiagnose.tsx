import { useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { useT } from '../i18n/i18n'
import type { ExtractOptions } from '../audio/vocalExtract'
import { diagnoseExtract } from './diagnoseExtract'

/** 設定の開発者向け「ボーカル抽出の診断」。結果は選んでコピーできる（不具合の報告に貼る） */
export default function ExtractDiagnose({ options }: { options: ExtractOptions }) {
  const t = useT()
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const run = async () => {
    setRunning(true)
    setLines([])
    try {
      await diagnoseExtract(options, (line) => setLines((l) => [...l, line]))
    } catch (e) {
      setLines((l) => [...l, String(e)])
    } finally {
      setRunning(false)
    }
  }
  return (
    <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13 }}>{t('settings.extractDiagnose')}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{t('settings.extractDiagnoseHelp')}</Typography>
        </Box>
        <Button size="small" variant="outlined" disabled={running} onClick={() => void run()}>
          {t(running ? 'settings.extractDiagnoseRunning' : 'settings.extractDiagnoseRun')}
        </Button>
      </Box>
      {lines.length > 0 && (
        <Box
          className="selectable"
          sx={{ font: '11px/1.5 ui-monospace, Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', p: 1, borderRadius: 1, bgcolor: 'action.hover', userSelect: 'text' }}
        >
          {lines.join('\n')}
        </Box>
      )}
    </Box>
  )
}
