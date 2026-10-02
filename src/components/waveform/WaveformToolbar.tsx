import { Button, Divider, IconButton, Tooltip } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAnglesRight,
  faArrowDown,
  faArrowPointer,
  faArrowUp,
  faChartArea,
  faVolumeHigh,
  faCheck,
  faExpand,
  faGripLines,
  faHeadphones,
  faMagnet,
  faWaveSquare,
  faFileAudio,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faMusic,
  faPen,
  faSpinner,
  faStop,
  faTrashCan,
  faSliders,
} from '@fortawesome/free-solid-svg-icons'
import { useT } from '../../i18n/i18n'
import { countRender } from '../../debug/debugStats'

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
  /** 再生中に表示範囲を再生位置に追従させるか */
  follow: boolean
  onFollowChange: (v: boolean) => void
  showSpectrogram: boolean
  onShowSpectrogramChange: (show: boolean) => void
  showPitch: boolean
  /** 波形の帯を出すか。ほかに出ている帯（スペクトログラム・ピッチ）が無ければ隠せない */
  showWave: boolean
  onShowWaveChange: (v: boolean) => void
  /** ピッチの帯にフォーカスしているか（ピッチの道具はそのときだけ出す） */
  pitchFocused: boolean
  /** 音量の帯（表示・フォーカス）と、描いた音量の曲線の適用・破棄 */
  showGain: boolean
  onShowGainChange: (v: boolean) => void
  gainFocused: boolean
  hasGainCurve: boolean
  onApplyGain: () => void
  onClearGain: () => void
  /** フォルマントの帯（表示・フォーカス）と、描いたフォルマントの曲線の試聴・適用・破棄 */
  formant: {
    show: boolean
    onShowChange: (v: boolean) => void
    focused: boolean
    hasCurve: boolean
    previewPlaying: boolean
    previewBusy: boolean
    onPreview: () => void
    onApply: () => void
    onClear: () => void
  }
  onShowPitchChange: (show: boolean) => void
  penMode: boolean
  onPenModeChange: (pen: boolean) => void
  /** 掴むモード（ピッチの線を掴んで上下に動かす） */
  grabMode: boolean
  onGrabModeChange: (grab: boolean) => void
  /** 描いたピッチがあるか（適用・破棄ボタンを出す） */
  hasCurve: boolean
  busy: boolean
  onApplyCurve: () => void
  onClearCurve: () => void
  /** ピッチ（F0）を解析済みか */
  pitchReady: boolean
  /** 選択範囲（なければ全体）のピッチをまとめて上下する（半音） */
  onShift: (semitones: number) => void
  /** 曲線を適用前に試聴しているか・準備中か */
  curvePreviewPlaying: boolean
  curvePreviewBusy: boolean
  onCurvePreview: () => void
  /** 選択範囲（なければ全体）のピッチの揺れを平らにする */
  onFlatten: () => void
  /** 「音程に揃える」ダイアログを開く */
  onSnap: () => void
  /** 「ビブラート」ダイアログを開く */
  onVibrato: () => void
  /** 「MIDI の音程を当てはめる」ダイアログを開く */
  onMidi: () => void
  /** ファイルを開く前など、すべて操作できないとき */
  disabled?: boolean
}

/**
 * ツールバーの操作のまとまりの区切り線（ツールバーの切り取りなどとの間と、帯ごとの操作の間で同じものを使う）。
 * 上下は空けず、置いた列の高さいっぱいに伸ばす。`gap` なら左右にすき間を付ける（ツールバーの Stack の spacing と同じ幅）
 */
export function ToolbarDivider({ gap = false }: { gap?: boolean }) {
  return <Divider orientation="vertical" flexItem sx={{ mx: gap ? 0.5 : 0 }} />
}
const Sep = () => <ToolbarDivider gap />

/** 波形の表示ツール（拡大縮小・表示の切替・ピッチ描画）。PC はツールバー、スマホは波形のすぐ下に置く */
export default function WaveformToolbar(p: Props) {
  countRender('WaveformToolbar')
  const t = useT()
  const off = !!p.disabled
  // ピッチの加工は、ピッチを表示して解析が済んでから
  const pitchOff = off || !p.showPitch || !p.pitchReady || p.busy
  const fm = p.formant
  return (
    <>
      <SmallButton title={t('wave.wheelHint', { action: t('wave.zoomOut') })} label={t('wave.zoomOut')} icon={faMagnifyingGlassMinus} disabled={off || !p.zoomed} onClick={p.onZoomOut} />
      <SmallButton title={t('wave.wheelHint', { action: t('wave.zoomIn') })} label={t('wave.zoomIn')} icon={faMagnifyingGlassPlus} disabled={off || !p.canZoomIn} onClick={p.onZoomIn} />
      <SmallButton title={t('wave.showAll')} label={t('wave.showAll')} icon={faExpand} disabled={off || !p.zoomed} onClick={p.onShowAll} />
      <SmallButton
        title={t('wave.followTooltip')}
        label={t('wave.follow')}
        icon={faAnglesRight}
        pressed={p.follow}
        disabled={off}
        onClick={() => p.onFollowChange(!p.follow)}
      />
      <Sep />
      <SmallButton
        title={t('wave.showWave')}
        label={t('wave.showWave')}
        icon={faWaveSquare}
        pressed={p.showWave}
        // どちらか一方の帯は必ず出す
        disabled={off || (p.showWave && !p.showPitch && !p.showSpectrogram && !p.showGain && !p.formant.show)}
        onClick={() => p.onShowWaveChange(!p.showWave)}
      />
      <SmallButton
        title={t('wave.spectrogram')}
        label={t('wave.spectrogram')}
        icon={faChartArea}
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
        title={t('wave.showGain')}
        label={t('wave.showGain')}
        icon={faVolumeHigh}
        pressed={p.showGain}
        disabled={off}
        onClick={() => p.onShowGainChange(!p.showGain)}
      />
      <SmallButton
        title={t('wave.showFormant')}
        label={t('wave.showFormant')}
        icon={faSliders}
        pressed={fm.show}
        disabled={off}
        onClick={() => fm.onShowChange(!fm.show)}
      />
      {/* ここから帯ごとの操作。帯の表示の切り替えとの間に区切り線を入れる */}
      {p.showGain && (p.gainFocused || p.hasGainCurve) && <Sep />}
      {/* 音量の帯にフォーカスしているときは、音量の曲線を描くペン */}
      {p.showGain && p.gainFocused && (
        <SmallButton
          title={t('wave.drawGainTooltip')}
          label={t('wave.drawGain')}
          icon={faPen}
          pressed={p.penMode}
          disabled={off}
          onClick={() => p.onPenModeChange(!p.penMode)}
        />
      )}
      {/* 描いた音量の曲線は、再生にはすぐ反映される。適用で音声に書き込み、破棄で捨てる */}
      {p.showGain && p.hasGainCurve && (
        <>
          {/* ピッチの曲線の「適用」と同じ見た目にそろえる */}
          <Button size="small" variant="contained" startIcon={<FontAwesomeIcon icon={faCheck} />} disabled={p.busy} onClick={p.onApplyGain}>
            {t('common.apply')}
          </Button>
          <SmallButton title={t('gainCurve.discard')} label={t('gainCurve.discard')} icon={faTrashCan} disabled={p.busy} onClick={p.onClearGain} />
        </>
      )}
      {fm.show && (fm.focused || fm.hasCurve) && <Sep />}
      {fm.show && fm.focused && (
        <SmallButton
          title={t('wave.drawFormantTooltip')}
          label={t('wave.drawFormant')}
          icon={faPen}
          pressed={p.penMode}
          disabled={off}
          onClick={() => p.onPenModeChange(!p.penMode)}
        />
      )}
      {/* フォルマントは再生にすぐ反映できないため、ピッチの曲線と同じく試聴してから適用する */}
      {fm.show && fm.hasCurve && (
        <>
          <SmallButton
            title={t('pitchTool.preview')}
            label={t('pitchTool.preview')}
            icon={fm.previewPlaying ? faStop : fm.previewBusy ? faSpinner : faHeadphones}
            pressed={fm.previewPlaying}
            disabled={p.busy || fm.previewBusy}
            onClick={fm.onPreview}
          />
          <Button size="small" variant="contained" startIcon={<FontAwesomeIcon icon={faCheck} />} disabled={p.busy} onClick={fm.onApply}>
            {t('common.apply')}
          </Button>
          <SmallButton title={t('formantCurve.discard')} label={t('formantCurve.discard')} icon={faTrashCan} disabled={p.busy} onClick={fm.onClear} />
        </>
      )}
      {p.showPitch && (p.pitchFocused || p.hasCurve) && <Sep />}
      {/* ピッチの道具は、ピッチの帯にフォーカスしているときだけ出す（ツールバーはフォーカスしている帯の操作にする） */}
      {p.showPitch && p.pitchFocused && (
        <>
          <SmallButton
            title={t('wave.drawPitchTooltip')}
            label={t('wave.drawPitch')}
            icon={faPen}
            pressed={p.penMode}
            disabled={off || !p.showPitch}
            onClick={() => p.onPenModeChange(!p.penMode)}
          />
          <SmallButton
            title={t('wave.grabPitchTooltip')}
            label={t('wave.grabPitch')}
            icon={faArrowPointer}
            pressed={p.grabMode}
            disabled={pitchOff}
            onClick={() => p.onGrabModeChange(!p.grabMode)}
          />
          <SmallButton title={t('pitchTool.up')} label={t('pitchTool.up')} icon={faArrowUp} disabled={pitchOff} onClick={() => p.onShift(1)} />
          <SmallButton title={t('pitchTool.down')} label={t('pitchTool.down')} icon={faArrowDown} disabled={pitchOff} onClick={() => p.onShift(-1)} />
          <SmallButton title={t('pitchTool.flatten')} label={t('pitchTool.flatten')} icon={faGripLines} disabled={pitchOff} onClick={p.onFlatten} />
          <SmallButton title={t('snap.title')} label={t('snap.title')} icon={faMagnet} disabled={pitchOff} onClick={p.onSnap} />
          <SmallButton title={t('vibrato.title')} label={t('vibrato.title')} icon={faWaveSquare} disabled={pitchOff} onClick={p.onVibrato} />
          <SmallButton title={t('midi.title')} label={t('midi.title')} icon={faFileAudio} disabled={pitchOff} onClick={p.onMidi} />
        </>
      )}
      {p.showPitch && p.hasCurve && (
        <>
          <SmallButton
            title={t('pitchTool.preview')}
            label={t('pitchTool.preview')}
            icon={p.curvePreviewPlaying ? faStop : p.curvePreviewBusy ? faSpinner : faHeadphones}
            pressed={p.curvePreviewPlaying}
            disabled={p.busy || p.curvePreviewBusy}
            onClick={p.onCurvePreview}
          />
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
