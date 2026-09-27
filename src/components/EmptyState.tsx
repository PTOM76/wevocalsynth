import { Box, Button, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileArrowUp, faFolderOpen } from '@fortawesome/free-solid-svg-icons'

/** ファイルを開く前の画面 */
export function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 12 }}>
      <Box sx={{ color: 'text.secondary', fontSize: 40 }}>
        <FontAwesomeIcon icon={faFileArrowUp} />
      </Box>
      <Typography variant="body2" color="text.secondary">
        WAV / MP3 / FLAC など（ドロップ可）
      </Typography>
      <Button variant="contained" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={onOpen}>
        ファイルを選択
      </Button>
    </Stack>
  )
}

/** ドラッグ中、画面全体でドロップを受け付けることを示すオーバーレイ */
export function DropOverlay() {
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
        ドロップして開く
      </Typography>
    </Box>
  )
}
