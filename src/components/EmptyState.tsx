import { useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClockRotateLeft, faFileArrowUp, faFolderOpen, faWaveSquare } from '@fortawesome/free-solid-svg-icons'
import { useT } from '../i18n/i18n'

/** 最近使用したファイルを最初に見せる数（残りは「もっと見る」で出す） */
const RECENT_SHOWN = 3

/** ファイルを開く前の画面。ファイルを開くか、音を0から作るか、最近使用したファイルを開き直す */
export function EmptyState({
  onOpen,
  onSynth,
  recent,
}: {
  onOpen: () => void
  onSynth: () => void
  /** 最近使用したファイル（使えないブラウザや、1つもなければ出さない） */
  recent?: { supported: boolean; names: string[]; open: (i: number) => void }
}) {
  const t = useT()
  const [showAll, setShowAll] = useState(false)
  const names = recent?.supported ? recent.names : []
  const shown = showAll ? names : names.slice(0, RECENT_SHOWN)
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
      {names.length > 0 && (
        <Stack spacing={0.25} sx={{ pt: 1, alignItems: 'center', maxWidth: 'min(360px, 90vw)', width: '100%' }}>
          <Typography variant="caption" color="text.secondary">
            {t('menu.recent')}
          </Typography>
          {shown.map((name, i) => (
            <Button
              key={`${i}-${name}`}
              size="small"
              color="inherit"
              startIcon={<FontAwesomeIcon icon={faClockRotateLeft} fontSize={12} />}
              onClick={() => recent?.open(i)}
              title={name}
              sx={{ maxWidth: '100%', justifyContent: 'flex-start', textTransform: 'none', fontWeight: 400 }}
            >
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </Box>
            </Button>
          ))}
          {names.length > RECENT_SHOWN && (
            <Button size="small" variant="text" onClick={() => setShowAll((v) => !v)} sx={{ fontSize: 12 }}>
              {t(showAll ? 'empty.showLess' : 'empty.showMore', { n: names.length - RECENT_SHOWN })}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  )
}
