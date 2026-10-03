import { useState } from 'react'
import { Box, ButtonBase, IconButton, LinearProgress, Popover, Stack, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useJobs, type Job } from '../progress/jobs'
import { useT } from '../i18n/i18n'

/** 進み具合（ゲージと割合）。`progress` が負なら割合が分からない */
function Bar({ progress, width }: { progress: number; width: number | string }) {
  return (
    <Box sx={{ width, display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress variant={progress < 0 ? 'indeterminate' : 'determinate'} value={Math.max(0, progress) * 100} sx={{ flex: 1 }} />
      {progress >= 0 && <Typography sx={{ fontSize: 12, minWidth: 32, textAlign: 'right' }}>{Math.round(progress * 100)}%</Typography>}
    </Box>
  )
}

function CancelButton({ job, size }: { job: Job; size: number }) {
  const t = useT()
  if (!job.cancel) return null
  return (
    <Tooltip title={t('task.cancel')}>
      <IconButton size="small" aria-label={t('task.cancel')} onClick={job.cancel} sx={{ p: size === 12 ? 0.25 : 0.75 }}>
        <FontAwesomeIcon icon={faXmark} style={{ fontSize: size }} />
      </IconButton>
    </Tooltip>
  )
}

/**
 * 進んでいる処理を 1 本のゲージにまとめて出す（progress/jobs.ts）。名前は大まかな種類（「抽出中」など）で、
 * ほかにもあれば「+1」を付ける。押すと、それぞれの詳しい名前・進み具合・中止を一覧で見られる。
 * 何も進んでいなければ何も出さない。`compact` はスマホの再生バー用
 */
export default function JobGauge({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const jobs = useJobs()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!jobs.length) return null
  // 割合の分からない解析より、操作で始めた処理を先に出す
  const main = jobs.find((j) => j.kind !== 'analyze') ?? jobs[0]
  const more = jobs.length - 1
  const size = compact ? 14 : 12
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0, flex: compact ? 1 : undefined, px: compact ? 0 : 1 }}>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t('job.details')}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: compact ? 1 : undefined, borderRadius: 0.5, px: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Typography noWrap sx={{ fontSize: 12, flexShrink: 0 }}>
          {t(`job.kind.${main.kind}`)}
          {more > 0 && ` +${more}`}
        </Typography>
        <Bar progress={main.progress} width={compact ? '100%' : 140} />
      </ButtonBase>
      <CancelButton job={main} size={size} />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Stack sx={{ p: 1.5, gap: 1.5, width: 320, maxWidth: '90vw' }}>
          {jobs.map((j) => (
            <Box key={j.id}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography className="selectable" sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>
                  {j.label}
                </Typography>
                <CancelButton job={j} size={12} />
              </Stack>
              <Bar progress={j.progress} width="100%" />
            </Box>
          ))}
        </Stack>
      </Popover>
    </Stack>
  )
}
