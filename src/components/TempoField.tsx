import { useRef, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Popover, Stack, Tooltip, Typography } from '@mui/material'
import type { TempoCandidate } from '../dsp/engine'
import { NumberInput } from './inspector/Inspector'
import { useT } from '../i18n/i18n'

/** タップの間隔がこれより空いたら、測り直しにする（ミリ秒） */
const TAP_RESET_MS = 2000
/** タップの平均に使う回数（直近のもの） */
const TAP_WINDOW = 8

interface Props {
  bpm: number
  /** 自動解析の候補（強い順） */
  candidates: TempoCandidate[]
  analyzing: boolean
  disabled?: boolean
  fontSize?: number
  /** BPM を決める（候補・×2・÷2・タップ。テンポの読み違いを直す操作）。1拍目の位置が分かるとき（候補を選んだとき）は一緒に渡す */
  onChange: (bpm: number, offset?: number) => void
  /** 数値を手で入れたとき（曲のテンポを変える操作。設定によっては全体の長さも変える）。無ければ onChange */
  onInput?: (bpm: number) => void
  onAnalyze: () => void
}

/** 0.01 BPM に丸める（自動解析も 0.01 まで求める） */
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * BPM の表示（ステータスバー・スマホの波形の下）。押すとパネルが開き、
 * 自動解析の候補から選ぶ・2倍/半分・タップで測る・数値で入れる・再解析ができる
 */
export default function TempoField(p: Props) {
  const t = useT()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const taps = useRef<number[]>([])
  const [tapCount, setTapCount] = useState(0)

  const tap = () => {
    const now = performance.now()
    const last = taps.current[taps.current.length - 1]
    if (last !== undefined && now - last > TAP_RESET_MS) taps.current = []
    taps.current = [...taps.current, now].slice(-TAP_WINDOW)
    setTapCount(taps.current.length)
    const n = taps.current.length
    if (n >= 2) p.onChange(round2((60000 * (n - 1)) / (taps.current[n - 1] - taps.current[0])))
  }

  return (
    <>
      <ButtonBase
        disabled={p.disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ px: 1, height: '100%', fontSize: p.fontSize ?? 12, whiteSpace: 'nowrap', gap: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        {p.analyzing && <CircularProgress size={10} />}
        {round2(p.bpm)} BPM
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack spacing={1.25} sx={{ p: 1.5, width: 260, fontSize: 13 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <NumberInput value={round2(p.bpm)} onChange={(v) => (p.onInput ?? p.onChange)(v)} min={20} max={400} step={0.01} unit="BPM" width={110} ariaLabel="BPM" />
            <Button size="small" onClick={() => p.onChange(round2(p.bpm * 2))}>
              ×2
            </Button>
            <Button size="small" onClick={() => p.onChange(round2(p.bpm / 2))}>
              ÷2
            </Button>
          </Stack>
          <Tooltip title={t('tempo.tapHint')}>
            <Button variant="outlined" size="small" onClick={tap}>
              {t('tempo.tap')}
              {tapCount >= 2 ? ` × ${tapCount}` : ''}
            </Button>
          </Tooltip>
          <Box>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1 }}>{t('tempo.candidates')}</Typography>
              <Button size="small" disabled={p.analyzing || p.disabled} onClick={p.onAnalyze} sx={{ fontSize: 12, minWidth: 0 }}>
                {p.analyzing ? t('common.analyzing') : t('tempo.analyze')}
              </Button>
            </Stack>
            {p.candidates.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>—</Typography>}
            {p.candidates.map((c) => (
              <ButtonBase
                key={c.bpm}
                onClick={() => p.onChange(c.bpm, c.offset)}
                sx={{ display: 'flex', width: '100%', gap: 1, px: 0.5, py: 0.25, borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Typography sx={{ fontSize: 13, width: 64, textAlign: 'right', fontWeight: Math.abs(c.bpm - p.bpm) < 0.05 ? 700 : 400 }}>
                  {c.bpm.toFixed(1)}
                </Typography>
                {/* 強さの棒 */}
                <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover' }}>
                  <Box sx={{ width: `${c.strength * 100}%`, height: '100%', borderRadius: 3, bgcolor: 'primary.main' }} />
                </Box>
              </ButtonBase>
            ))}
          </Box>
        </Stack>
      </Popover>
    </>
  )
}
