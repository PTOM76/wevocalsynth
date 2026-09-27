import { Box, Button, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileArrowUp, faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../i18n/i18n'

/** ファイルを開く前の画面 */
export function EmptyState({ onOpen }: { onOpen: () => void }) {
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
    </Stack>
  )
}

/** ドラッグ中、画面全体でドロップを受け付けることを示すオーバーレイ */
export function DropOverlay() {
  const t = useT()
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 'modal',
        pointerEvents: 'none',
        bgcolor: 'action.hover',
        outline: 2,
        outlineColor: 'primary.main',
        outlineOffset: -2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="h6" color="primary">
        {t('empty.drop')}
      </Typography>
    </Box>
  )
}
