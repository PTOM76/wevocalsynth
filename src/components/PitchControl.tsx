import { IconButton, Slider, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnet } from '@fortawesome/free-solid-svg-icons'
import { describePitch } from '../audio/notes'
import { COMPACT_SLIDER_SX, NumberInput, PropRow } from './inspector/Inspector'
import { useT } from '../i18n/i18n'

interface Props {
  /** ピッチ変更量（半音、小数可） */
  semitones: number
  onChange: (semitones: number) => void
  /** 範囲の今の音程（MIDI ノート番号）。解析中は undefined、無声・複数範囲などは null */
  currentMidi: number | null | undefined
}

const round2 = (v: number) => Math.round(v * 100) / 100
/** 数値入力と同じ 0.001 単位に丸める（「音程を合わせる」の結果用） */
const round3 = (v: number) => Math.round(v * 1000) / 1000

/** ピッチ変更量の行と、今の音程→変更後の音程の行。最寄りの音名に合わせるボタン付き */
export default function PitchControl({ semitones, onChange, currentMidi }: Props) {
  const t = useT()
  const target = currentMidi != null ? currentMidi + semitones : null

  return (
    <>
      <PropRow label={t('process.pitch')}>
        <Slider
          aria-label={t('process.pitchAria')}
          value={semitones}
          min={-24}
          max={24}
          step={0.1}
          marks={[-12, 0, 12].map((value) => ({ value }))}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          onChange={(_, v) => onChange(round2(v as number))}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput value={semitones} onChange={onChange} min={-24} max={24} step={0.01} unit={t('process.semitoneUnit')} ariaLabel={t('process.pitchAria')} />
      </PropRow>
      <PropRow>
        <Typography sx={{ flex: 1, fontSize: 12, color: 'text.secondary' }} noWrap>
          {currentMidi === undefined
            ? t('process.noteAnalyzing')
            : currentMidi === null || target === null
              ? t('process.noteUnknown')
              : semitones === 0
                ? t('process.note', { note: describePitch(currentMidi) })
                : t('process.noteChange', { from: describePitch(currentMidi), to: describePitch(target) })}
        </Typography>
        <Tooltip title={t('process.snapTooltip')}>
          <span>
            <IconButton
              size="small"
              aria-label={t('process.snap')}
              disabled={target === null}
              onClick={() => target !== null && onChange(round3(semitones + Math.round(target) - target))}
            >
              <FontAwesomeIcon icon={faMagnet} fontSize={12} />
            </IconButton>
          </span>
        </Tooltip>
      </PropRow>
    </>
  )
}
