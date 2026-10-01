import { Box, Button, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileArrowUp, faFolderOpen, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../i18n/i18n'

/** ファイルを開く前の画面。ファイルを開くか、音を0から作るか */
export function EmptyState({ onOpen, onSynth }: { onOpen: () => void; onSynth: () => void }) {
  const t = useT()
  return (
    <Stack spacing={2} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <Box sx={{ color: 'text.secondary', fontSize: 40 }}>
        <FontAwesomeIcon icon={faFileArrowUp} />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {t('empty.formats')}
      </Typography>
      <Button variant="contained" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={onOpen}>
        {t('empty.choose')}
      </Button>
      <Button variant="text" size="small" startIcon={<FontAwesomeIcon icon={faWaveSquare} />} onClick={onSynth}>
        {t('synth.open')}
      </Button>
    </Stack>
  )
}
