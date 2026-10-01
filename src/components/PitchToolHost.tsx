import { addVibrato, fitMidi, snapPitch } from '../audio/pitchTools'
import type { usePitchTools } from '../hooks/usePitchTools'
import { SnapDialog, VibratoDialog } from './PitchToolDialogs'
import { MidiDialog } from './MidiDialog'

/** 開いているピッチの一括操作のダイアログ */
export type PitchDialogKind = 'snap' | 'vibrato' | 'midi' | null

/**
 * ピッチの一括操作のダイアログ（音程に揃える・ビブラート・MIDI の当てはめ）をまとめて置く（App から分けたもの）。
 * どれも結果を目標ピッチの曲線にする（pitchTools.edit）
 */
export default function PitchToolHost(p: {
  open: PitchDialogKind
  onClose: () => void
  hasSelection: boolean
  /** 選択範囲の始まり（MIDI の開始位置の初期値。無ければ1拍目の位置） */
  selectionStart: number | null
  bpm: number
  beatOffset: number
  pitchTools: ReturnType<typeof usePitchTools>
}) {
  const { edit } = p.pitchTools
  return (
    <>
      <SnapDialog
        open={p.open === 'snap'}
        hasSelection={p.hasSelection}
        onClose={p.onClose}
        onRun={(o) => edit((cur, f0, k0, k1) => snapPitch(cur, f0, k0, k1, o))}
      />
      <VibratoDialog
        open={p.open === 'vibrato'}
        hasSelection={p.hasSelection}
        bpm={p.bpm}
        onClose={p.onClose}
        onRun={(o) => edit((cur, f0, k0, k1) => addVibrato(cur, f0, k0, k1, o))}
      />
      <MidiDialog
        open={p.open === 'midi'}
        hasSelection={p.hasSelection}
        bpm={p.bpm}
        defaultOffset={p.selectionStart ?? p.beatOffset}
        onClose={p.onClose}
        onRun={(o) => edit((cur, f0, k0, k1) => fitMidi(cur, f0, k0, k1, o))}
      />
    </>
  )
}
