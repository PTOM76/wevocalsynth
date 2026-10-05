import { useEffect, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Select, Typography } from '@mui/material'
import { listInputDevices, openInput, startRecording, type Clip, type InputDevice, type InputOptions, type Recording } from 'wevocal-lib'
import { useT } from '../i18n/i18n'

interface Props {
  open: boolean
  input: InputOptions
  /** 入力元を変えた（設定にも保存する） */
  onDevice: (id: string) => void
  onClose: () => void
  /** 録った音を使う（新しいトラックか、何も開いていなければ新しい素材） */
  onUse: (clip: Clip) => void
}

const time = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${Math.floor((sec % 1) * 10)}`

/** ボイスレコーダー。圧縮しない音で録り、止めたら使うか録り直すかを選ぶ（wevocal-lib の record.ts） */
export default function RecordDialog(p: Props) {
  const t = useT()
  const [devices, setDevices] = useState<InputDevice[]>([])
  const [rec, setRec] = useState<Recording | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [sec, setSec] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const recRef = useRef<Recording | null>(null)
  recRef.current = rec

  useEffect(() => {
    if (!p.open) return
    const load = () => void listInputDevices().then(setDevices)
    load()
    navigator.mediaDevices?.addEventListener('devicechange', load)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load)
  }, [p.open])

  // 閉じたら、録音中のものは捨てる
  useEffect(() => {
    if (p.open) return
    recRef.current?.cancel()
    setRec(null)
    setClip(null)
    setSec(0)
    setLevel(0)
    setError('')
  }, [p.open])

  // 録音中は経過時間とメーターを更新する
  useEffect(() => {
    if (!rec) return
    const id = setInterval(() => {
      setSec(rec.seconds())
      setLevel((l) => Math.max(rec.peak(), l * 0.8))
    }, 100)
    return () => clearInterval(id)
  }, [rec])

  const start = async () => {
    setError('')
    setClip(null)
    try {
      const r = await startRecording(await openInput(p.input))
      setSec(0)
      setRec(r)
      // 許可したあとはデバイス名が見えるので、一覧を読み直す
      setDevices(await listInputDevices())
    } catch (e) {
      setError(t('record.failed', { error: String(e) }))
    }
  }
  const stop = async () => {
    if (!rec) return
    const c = await rec.stop()
    setRec(null)
    setLevel(0)
    setClip(c)
  }

  const options: [string, string][] = [['', t('record.defaultInput')], ...devices.map((d, i): [string, string] => [d.id, d.label || t('record.unnamed', { n: i + 1 })])]
  if (p.input.deviceId && !devices.some((d) => d.id === p.input.deviceId)) options.push([p.input.deviceId, t('record.missing')])
  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('record.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          <Select size="small" value={p.input.deviceId} displayEmpty disabled={!!rec} onChange={(e) => p.onDevice(e.target.value)} aria-label={t('record.input')} sx={{ fontSize: 13 }}>
            {options.map(([id, label]) => (
              <MenuItem key={id} value={id} sx={{ fontSize: 13 }}>
                {label}
              </MenuItem>
            ))}
          </Select>
          <LinearProgress variant="determinate" value={Math.min(100, level * 100)} color={level > 0.98 ? 'error' : 'primary'} aria-label={t('record.level')} sx={{ height: 8, borderRadius: 1 }} />
          <Typography sx={{ fontFamily: 'monospace', fontSize: 20, textAlign: 'center' }}>{time(clip ? clip.channels[0].length / clip.sampleRate : sec)}</Typography>
          {error && <Typography className="selectable" sx={{ fontSize: 12, color: 'error.main' }}>{error}</Typography>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={p.onClose}>
          {t(clip ? 'record.discard' : 'common.cancel')}
        </Button>
        {rec ? (
          <Button size="small" variant="contained" color="error" onClick={() => void stop()}>
            {t('record.stop')}
          </Button>
        ) : (
          <Button size="small" variant={clip ? 'text' : 'contained'} color="error" onClick={() => void start()}>
            {t(clip ? 'record.retake' : 'record.start')}
          </Button>
        )}
        {clip && (
          <Button size="small" variant="contained" onClick={() => (p.onUse(clip), p.onClose())}>
            {t('record.use')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
