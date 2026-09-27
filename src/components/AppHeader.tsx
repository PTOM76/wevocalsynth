import { useState } from 'react'
import { AppBar, Box, Button, IconButton, Menu, MenuItem, Toolbar, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload, faFloppyDisk, faFolderOpen, faRotateLeft, faRotateRight, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import type { WavFormat } from '../audio/wav'

interface Props {
  canUndo: boolean
  canRedo: boolean
  canExport: boolean
  busy: boolean
  onUndo: () => void
  onRedo: () => void
  onOpen: () => void
  onExport: (format: WavFormat) => void
  /** プロジェクト（.wvsp）として保存する */
  onSave: () => void
}

const FORMATS: { format: WavFormat; label: string }[] = [
  { format: 'pcm16', label: '16-bit PCM' },
  { format: 'pcm24', label: '24-bit PCM' },
  { format: 'float32', label: '32-bit float' },
]

/** 上部のアプリバー（元に戻す・やり直す・開く・WAV出力） */
export default function AppHeader({ canUndo, canRedo, canExport, busy, onUndo, onRedo, onOpen, onExport, onSave }: Props) {
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 1 }}>
        <Box component="span" sx={{ color: 'primary.main', display: 'flex' }}>
          <FontAwesomeIcon icon={faWaveSquare} />
        </Box>
        <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
          WeVocalSynth
        </Typography>
        <Tooltip title="元に戻す (Ctrl+Z)">
          <span>
            <IconButton aria-label="元に戻す" onClick={onUndo} disabled={!canUndo || busy}>
              <FontAwesomeIcon icon={faRotateLeft} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="やり直す (Ctrl+Y)">
          <span>
            <IconButton aria-label="やり直す" onClick={onRedo} disabled={!canRedo || busy}>
              <FontAwesomeIcon icon={faRotateRight} />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="outlined" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={onOpen}>
          開く
        </Button>
        <Tooltip title="プロジェクトとして保存（.wvsp）">
          <span>
            <Button
              variant="outlined"
              startIcon={<FontAwesomeIcon icon={faFloppyDisk} />}
              disabled={!canExport || busy}
              onClick={onSave}
            >
              保存
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          startIcon={<FontAwesomeIcon icon={faDownload} />}
          disabled={!canExport || busy}
          onClick={(e) => setExportAnchor(e.currentTarget)}
        >
          WAV出力
        </Button>
        <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
          {FORMATS.map(({ format, label }) => (
            <MenuItem
              key={format}
              onClick={() => {
                setExportAnchor(null)
                onExport(format)
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      </Toolbar>
    </AppBar>
  )
}
