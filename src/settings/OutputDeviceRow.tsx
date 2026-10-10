// 設定の「音声の出力先」の行（wevocal-lib。WeVocal Studio と共通）
import { OutputDeviceRow as LibRow } from 'wevocal-lib/react'
import { useT } from '../i18n/i18n'

export default function OutputDeviceRow(p: { value: string; onChange: (id: string) => void }) {
  const t = useT()
  return <LibRow {...p} t={t} />
}
