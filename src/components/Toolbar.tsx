// PC の上のツールバー（再生、編集、表示のボタン）
import type { ReactNode } from 'react'
import { IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { OverflowRow } from 'pevenmui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faCopy, faCropSimple, faPaste, faPause, faPlay, faRepeat, faScissors, faStop, faXmark } from '@fortawesome/free-solid-svg-icons'
import { SmallButton, ToolbarDivider } from './waveform/WaveformToolbar'
import { useT } from '../i18n/i18n'
import { countRender } from '../debug/debugStats'
import LiveTime from './LiveTime'
import { stableMemo } from './stableMemo'
import { withKey } from '../commands'
import type { Keymap } from '../settings/keymap'
import type { MessageKey } from '../i18n/i18n'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

/** ツールバーの編集のボタン（コマンドの id、名前、アイコン） */
const EDIT_BUTTONS = [
  ['cut', 'edit.cut', faScissors],
  ['copy', 'edit.copy', faCopy],
  ['paste', 'edit.paste', faPaste],
  ['trim', 'edit.trim', faCropSimple],
  ['clearSelection', 'edit.clearSelection', faXmark],
] as const satisfies readonly (readonly [string, MessageKey, IconDefinition])[]
type EditButton = (typeof EDIT_BUTTONS)[number][0]

interface Props {
  playing: boolean
  position: number
  /** 再生中の今の位置（時間表示が自分で読む） */
  livePosition: () => number
  duration: number
  /** 再生位置の直接入力（時間表示を押す） */
  onSeek?: (t: number) => void
  timeEditRequest?: number
  hasSelection: boolean
  loopPlaying: boolean
  disabled: boolean
  onTogglePlay: () => void
  onStop: () => void
  onPlaySelection: () => void
  onLoop: () => void
  /** 全体のレベルメーター */
  meter?: ReactNode
  /** 表示ツール（拡大縮小・表示の切替・ピッチ描画） */
  viewTools: ReactNode
  /** キーの割り当て（ツールチップに表記する） */
  keymap: Keymap
  /** 編集のボタン（切り取りなど）が押せるか。押したら onCommand で、そのコマンドを実行する */
  edit: Record<EditButton, boolean>
  onCommand: (id: EditButton) => void
}

/** PC 用のツールバー（高さ 40px）。再生操作・再生位置、編集（切り取りなど）、波形の表示ツールを1行に並べる */
function Toolbar(p: Props) {
  countRender('Toolbar')
  const t = useT()
  return (
    <Stack
      direction="row"
      spacing={0.5}
      // すき間は Stack の spacing が付けるので、区切り線自体には付けない
      divider={<ToolbarDivider />}
      sx={{ height: 40, px: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Tooltip title={withKey(t('play.playPause'), p.keymap, 'playPause')}>
          <span>
            <IconButton aria-label={t('play.playPause')} color="primary" size="small" disabled={p.disabled} onClick={p.onTogglePlay}>
              <FontAwesomeIcon icon={p.playing ? faPause : faPlay} />
            </IconButton>
          </span>
        </Tooltip>
        <SmallButton title={t('common.stop')} label={t('common.stop')} icon={faStop} disabled={p.disabled} onClick={p.onStop} />
        <SmallButton title={t('play.playSelection')} label={t('play.playSelection')} icon={faCirclePlay} disabled={p.disabled || !p.hasSelection} onClick={p.onPlaySelection} />
        <SmallButton title={t('play.repeatTooltip')} label={t('play.repeat')} icon={faRepeat} pressed={p.loopPlaying} disabled={p.disabled} onClick={p.onLoop} />
        <Typography variant="body2" sx={{ fontFamily: 'monospace', ml: 1, minWidth: 150 }}>
          <LiveTime position={p.position} playing={p.playing} livePosition={p.livePosition} duration={p.duration} onSeek={p.disabled ? undefined : p.onSeek} editRequest={p.timeEditRequest} />
        </Typography>
        {p.meter}
      </Stack>
      {/* 編集と表示ツールは、入りきらなければ後ろから ▼ の中に入れる（再生まわりは常に出す） */}
      <OverflowRow>
        {EDIT_BUTTONS.map(([id, label, icon]) => (
          <SmallButton key={id} title={withKey(t(label), p.keymap, id)} label={t(label)} icon={icon} disabled={!p.edit[id]} onClick={() => p.onCommand(id)} />
        ))}
        <ToolbarDivider gap />
        {p.viewTools}
      </OverflowRow>
    </Stack>
  )
}

// 関数の props が作り直されても、ほかが同じなら描き直さない
export default stableMemo(Toolbar)
