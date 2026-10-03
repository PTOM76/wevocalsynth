import { Box, Button, IconButton, Slider, Tooltip, Typography } from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { COMPACT_SLIDER_SX, InspectorSection, NumberInput, PropRow, useDoubleClickReset } from './inspector/Inspector'
import { useT, type MessageKey } from '../i18n/i18n'
import { countRender } from '../debug/debugStats'
import { panLabel } from '../hooks/useClipCommands'
import type { TrackFader } from '../audio/tracks'
import { stableMemo } from './stableMemo'

export type VolumeAction = 'fadeIn' | 'fadeOut' | 'normalize' | 'silence'

interface Props {
  hasSelection: boolean
  busy: boolean
  /** トラックのフェーダー（音量・パン）。適用ボタンは無く、再生と書き出しに常に掛かる */
  fader: TrackFader
  onFaderChange: (patch: Partial<TrackFader>) => void
  /** 選択範囲の、適用前の音量・パン（スライダーの値）。再生中の音にすぐ反映され、「適用」で音声に書き込む */
  db: number
  onDbChange: (db: number) => void
  pan: number
  onPanChange: (pan: number) => void
  /** 選択範囲のゲインとパンをまとめて適用する */
  onGain: (db: number, pan: number) => void
  onAction: (action: VolumeAction) => void
}

// 名前だけでは分かりにくいものには説明（tooltip）を付ける
const ACTIONS: { action: VolumeAction; label: MessageKey; tooltip?: MessageKey }[] = [
  { action: 'fadeIn', label: 'volume.fadeIn' },
  { action: 'fadeOut', label: 'volume.fadeOut' },
  { action: 'normalize', label: 'volume.normalize', tooltip: 'volume.normalizeTooltip' },
  { action: 'silence', label: 'volume.silence' },
]

const SMALL_BUTTON_SX = { minWidth: 0, height: 26, px: 1, fontSize: 12 } as const

/** 段の見出し（「トラック」「選択範囲」） */
function Heading({ children }: { children: string }) {
  return <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>{children}</Typography>
}

/** 音量（dB）とパンの2行。トラックのフェーダーと、選択範囲の適用前の値で同じ形を使う */
function GainPanRows(p: { db: number; onDb: (v: number) => void; pan: number; onPan: (v: number) => void; dbAria: string; panAria: string; dbLabel: string; panLabel: string }) {
  // ダブルクリックで 0 dB・中央に戻す（設定で有効なときだけ）
  const resetDb = useDoubleClickReset(() => p.onDb(0))
  const resetPan = useDoubleClickReset(() => p.onPan(0))
  return (
    <>
      <PropRow label={p.dbLabel}>
        <Slider
          aria-label={p.dbAria}
          value={p.db}
          min={-24}
          max={12}
          step={0.5}
          marks={[-12, 0].map((value) => ({ value }))}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(_, v) => p.onDb(v as number)}
          {...resetDb}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput value={p.db} onChange={p.onDb} min={-24} max={12} step={0.5} unit="dB" ariaLabel={p.dbAria} />
      </PropRow>
      <PropRow label={p.panLabel}>
        <Slider
          aria-label={p.panAria}
          value={p.pan * 100}
          min={-100}
          max={100}
          step={1}
          marks={[{ value: 0 }]}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => panLabel(v / 100)}
          onChange={(_, v) => p.onPan((v as number) / 100)}
          {...resetPan}
          sx={COMPACT_SLIDER_SX}
        />
        <NumberInput value={Math.round(p.pan * 100)} onChange={(v) => p.onPan(v / 100)} min={-100} max={100} step={1} ariaLabel={p.panAria} />
      </PropRow>
    </>
  )
}

/**
 * インスペクタの「音量」。
 * - トラック: フェーダー（音量・パン）。動かした値がそのまま再生と書き出しに入る（適用ボタンは無い）
 * - 選択範囲（範囲を選んでいるときだけ）: 動かすと再生中の音にすぐ反映し、「適用」で音声に書き込む
 * - フェード・ノーマライズ・無音化は、選択範囲（なければ全体）に対する編集
 */
function VolumePanel({ hasSelection, busy, fader, onFaderChange, db, onDbChange: setDb, pan, onPanChange: setPan, onGain, onAction }: Props) {
  countRender('VolumePanel')
  const t = useT()

  return (
    <InspectorSection title={t('volume.title')}>
      <Heading>{t('volume.track')}</Heading>
      <GainPanRows
        db={fader.db}
        onDb={(v) => onFaderChange({ db: v })}
        pan={fader.pan}
        onPan={(v) => onFaderChange({ pan: v })}
        dbLabel={t('volume.gain')}
        panLabel={t('volume.pan')}
        dbAria={t('volume.trackGainAria')}
        panAria={t('volume.trackPanAria')}
      />
      {hasSelection && (
        <>
          <Heading>{t('common.selection')}</Heading>
          <GainPanRows
            db={db}
            onDb={setDb}
            pan={pan}
            onPan={setPan}
            dbLabel={t('volume.gain')}
            panLabel={t('volume.pan')}
            dbAria={t('volume.gainAria')}
            panAria={t('volume.panAria')}
          />
          <PropRow>
            <Box sx={{ flexGrow: 1 }} />
            {/* 適用前のゲインとパンを 0 に戻す（再生中の音も元に戻る）。加工パネルのリセットと同じ見た目 */}
            <Tooltip title={t('common.reset')}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t('common.reset')}
                  disabled={busy || (db === 0 && pan === 0)}
                  onClick={() => {
                    setDb(0)
                    setPan(0)
                  }}
                >
                  <FontAwesomeIcon icon={faArrowRotateLeft} fontSize={12} />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              size="small"
              variant="contained"
              disabled={busy || (db === 0 && pan === 0)}
              onClick={() => {
                onGain(db, pan)
                setDb(0)
                setPan(0)
              }}
              sx={{ ...SMALL_BUTTON_SX, px: 1.5 }}
            >
              {t('common.apply')}
            </Button>
          </PropRow>
        </>
      )}
      <Heading>{t(hasSelection ? 'common.selection' : 'common.whole')}</Heading>
      {/* 2列に並べる（横幅の狭いインスペクタでも折り返しで崩れないように） */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {ACTIONS.map(({ action, label, tooltip }) => {
          const button = (
            <Button key={action} size="small" variant="outlined" disabled={busy} onClick={() => onAction(action)} sx={SMALL_BUTTON_SX}>
              {t(label)}
            </Button>
          )
          return tooltip ? (
            <Tooltip key={action} title={t(tooltip)}>
              {/* 押せないときも説明を出すため span で包む */}
              <Box component="span" sx={{ display: 'grid' }}>{button}</Box>
            </Tooltip>
          ) : (
            button
          )
        })}
      </Box>
    </InspectorSection>
  )
}

// 関数の props が作り直されても、ほかが同じなら描き直さない
export default stableMemo(VolumePanel)
