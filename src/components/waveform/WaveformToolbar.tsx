import { Button, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material'
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
import type { View } from './draw'

/** ツールチップ付きの小さいアイコンボタン。`pressed` を渡すと ON/OFF の切替ボタンになる */
function SmallButton(props: {
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
  view: View
  duration: number
  zoomed: boolean
  canZoomIn: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onShowAll: () => void
  onScroll: (start: number) => void
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
}

/** 波形の下のツールバー（拡大縮小・表示切替・ピッチ描画・横スクロール） */
export default function WaveformToolbar(p: Props) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
      <SmallButton title="縮小 (Ctrl+ホイール)" label="縮小" icon={faMagnifyingGlassMinus} disabled={!p.zoomed} onClick={p.onZoomOut} />
      <SmallButton title="拡大 (Ctrl+ホイール)" label="拡大" icon={faMagnifyingGlassPlus} disabled={!p.canZoomIn} onClick={p.onZoomIn} />
      <SmallButton
        title="スペクトログラム表示"
        label="スペクトログラム表示"
        icon={faChartColumn}
        pressed={p.showSpectrogram}
        onClick={() => p.onShowSpectrogramChange(!p.showSpectrogram)}
      />
      <SmallButton
        title="ピッチ表示"
        label="ピッチ表示"
        icon={faMusic}
        pressed={p.showPitch}
        onClick={() => p.onShowPitchChange(!p.showPitch)}
      />
      {p.showPitch && (
        <SmallButton
          title="ピッチを描く（Shift: 半音に吸着 / Alt: 消す）"
          label="ピッチを描く"
          icon={faPen}
          pressed={p.penMode}
          onClick={() => p.onPenModeChange(!p.penMode)}
        />
      )}
      {p.showPitch && p.hasCurve && (
        <>
          <Button
            size="small"
            variant="contained"
            startIcon={<FontAwesomeIcon icon={faCheck} />}
            disabled={p.busy}
            onClick={p.onApplyCurve}
          >
            適用
          </Button>
          <SmallButton title="描いたピッチを破棄" label="描いたピッチを破棄" icon={faTrashCan} disabled={p.busy} onClick={p.onClearCurve} />
        </>
      )}
      <SmallButton title="全体表示" label="全体表示" icon={faExpand} disabled={!p.zoomed} onClick={p.onShowAll} />
      {/* 表示範囲の横スクロールバー */}
      <Slider
        size="small"
        aria-label="表示位置"
        disabled={!p.zoomed}
        value={p.view.start}
        min={0}
        max={Math.max(0, p.duration - p.view.dur)}
        step={p.view.dur / 100}
        onChange={(_, v) => p.onScroll(v as number)}
        sx={{ mx: 1 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
        {p.view.dur.toFixed(p.view.dur < 1 ? 3 : 1)}s
      </Typography>
    </Stack>
  )
}
