// 音声を MIDI の音符に並べるダイアログ（部品は wevocal-lib の SamplerDialog。WeVocal Studio と共通）
import type { ComponentProps } from 'react'
import { SamplerDialog as LibSamplerDialog } from 'wevocal-lib/react'
import { useT } from '../i18n/i18n'

export type { SamplerOptions } from 'wevocal-lib/react'

export default function SamplerDialog(p: Omit<ComponentProps<typeof LibSamplerDialog>, 't'>) {
  const t = useT()
  return <LibSamplerDialog {...p} t={t} />
}
