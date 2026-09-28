import { Button, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChartColumn,
  faCheck,
  faExpand,
  faGripLines,
  faMagnet,
  faWaveSquare,
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
  /** ピッチ（F0）を解析済みか */
  pitchReady: boolean
  /** 選択範囲（なければ全体）のピッチの揺れを平らにする */
  onFlatten: () => void
  /** 「音程に揃える」ダイアログを開く */
  onSnap: () => void
  /** 「ビブラート」ダイアログを開く */
  onVibrato: () => void
  /** ファイルを開く前など、すべて操作できないとき */
  disabled?: boolean
}

/** 波形の表示ツール（拡大縮小・表示の切替・ピッチ描画）。PC はツールバー、スマホは波形のすぐ下に置く */
export default function WaveformToolbar(p: Props) {
  const t = useT()
  const off = !!p.disabled
  // ピッチの加工は、ピッチを表示して解析が済んでから
  const pitchOff = off || !p.showPitch || !p.pitchReady || p.busy
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
      <SmallButton title={t('pitchTool.flatten')} label={t('pitchTool.flatten')} icon={faGripLines} disabled={pitchOff} onClick={p.onFlatten} />
      <SmallButton title={t('snap.title')} label={t('snap.title')} icon={faMagnet} disabled={pitchOff} onClick={p.onSnap} />
      <SmallButton title={t('vibrato.title')} label={t('vibrato.title')} icon={faWaveSquare} disabled={pitchOff} onClick={p.onVibrato} />
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
