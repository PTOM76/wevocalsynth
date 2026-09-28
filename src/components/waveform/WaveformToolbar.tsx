import { Button, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChartColumn,
  faCheck,
  faExpand,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faMusic,
  faPen,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { useT } from '../../i18n/i18n'

/** ツールチップ付きの小さいアイコンボタン。`pressed` を渡すと ON/OFF の切替ボタンになる */
export function SmallButton(props: {
  title: string
  label: string
  icon: IconDefinition
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip title={props.title}>
      <span>
        <IconButton
          aria-label={props.label}
          aria-pressed={props.pressed}
          size="small"
          color={props.pressed ? 'primary' : 'default'}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          <FontAwesomeIcon icon={props.icon} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

interface Props {
  zoomed: boolean
  canZoomIn: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onShowAll: () => void
  showSpectrogram: boolean
  onShowSpectrogramChange: (show: boolean) => void
  showPitch: boolean
  onShowPitchChange: (show: boolean) => void
  penMode: boolean
  onPenModeChange: (pen: boolean) => void
  /** 描いたピッチがあるか（適用・破棄ボタンを出す） */
  hasCurve: boolean
  busy: boolean
  onApplyCurve: () => void
  onClearCurve: () => void
  /** ファイルを開く前など、すべて操作できないとき */
  disabled?: boolean
}

/** 波形の表示ツール（拡大縮小・表示の切替・ピッチ描画）。PC はツールバー、スマホは波形のすぐ下に置く */
export default function WaveformToolbar(p: Props) {
  const t = useT()
  const off = !!p.disabled
  return (
    <>
      <SmallButton title={t('wave.wheelHint', { action: t('wave.zoomOut') })} label={t('wave.zoomOut')} icon={faMagnifyingGlassMinus} disabled={off || !p.zoomed} onClick={p.onZoomOut} />
      <SmallButton title={t('wave.wheelHint', { action: t('wave.zoomIn') })} label={t('wave.zoomIn')} icon={faMagnifyingGlassPlus} disabled={off || !p.canZoomIn} onClick={p.onZoomIn} />
      <SmallButton title={t('wave.showAll')} label={t('wave.showAll')} icon={faExpand} disabled={off || !p.zoomed} onClick={p.onShowAll} />
      <SmallButton
        title={t('wave.spectrogram')}
        label={t('wave.spectrogram')}
        icon={faChartColumn}
        pressed={p.showSpectrogram}
        disabled={off}
        onClick={() => p.onShowSpectrogramChange(!p.showSpectrogram)}
      />
      <SmallButton
        title={t('wave.pitch')}
        label={t('wave.pitch')}
        icon={faMusic}
        pressed={p.showPitch}
        disabled={off}
        onClick={() => p.onShowPitchChange(!p.showPitch)}
      />
      <SmallButton
        title={t('wave.drawPitchTooltip')}
        label={t('wave.drawPitch')}
        icon={faPen}
        pressed={p.penMode}
        disabled={off || !p.showPitch}
        onClick={() => p.onPenModeChange(!p.penMode)}
      />
      {p.showPitch && p.hasCurve && (
        <>
          <Button
            size="small"
            variant="contained"
            startIcon={<FontAwesomeIcon icon={faCheck} />}
            disabled={p.busy}
            onClick={p.onApplyCurve}
          >
            {t('common.apply')}
          </Button>
          <SmallButton title={t('wave.discardCurve')} label={t('wave.discardCurve')} icon={faTrashCan} disabled={p.busy} onClick={p.onClearCurve} />
        </>
      )}
    </>
  )
}
