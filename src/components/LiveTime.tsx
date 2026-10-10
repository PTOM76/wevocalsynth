// 再生中の時間の表示（部品は PevenMUI の LiveTime。WeVocal Studio と共通）
import { LiveTime as PevenLiveTime } from 'pevenmui'
import { useT } from '../i18n/i18n'

/** 「再生位置 / 長さ」の表示。押すと再生位置を数字で入れられる */
export default function LiveTime(p: { position: number; playing: boolean; livePosition: () => number; duration: number; onSeek?: (t: number) => void; editRequest?: number }) {
  const t = useT()
  return <PevenLiveTime {...p} inputLabel={t('time.input')} />
}
