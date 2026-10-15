// 音を 0 から作るダイアログ（部品は wevocal-lib の SynthDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { SynthDialog as LibSynthDialog } from 'wevocal-lib/react'
import { useT } from '../i18n/i18n'

/** 音を 0 から作る。音色と、1 音か MIDI のメロディかを選んで合成し、新しいトラックにする */
export default function SynthDialog(p: Omit<ComponentProps<typeof LibSynthDialog>, 't'>) {
  const t = useT()
  return <LibSynthDialog {...p} t={t} />
}
