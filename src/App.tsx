import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlay, faDownload, faFileArrowUp, faFolderOpen, faPause, faPlay, faRotateLeft, faRotateRight, faStop, faWaveSquare, faXmark, faScissors, faCopy, faPaste, faCropSimple } from '@fortawesome/free-solid-svg-icons'
import type { Clip, Range } from './audio/types'
import { clipDuration } from './audio/types'
import { decodeFile } from './audio/decode'
import { encodeWav, type WavFormat } from './audio/wav'
import { applyEdit, insertAt, removeRange, sliceClip } from './audio/edit'
import { usePlayer } from './audio/usePlayer'
import Waveform, { formatTime } from './components/Waveform'
import EditPanel, { type EditParams } from './components/EditPanel'

const HISTORY_LIMIT = 20

type Source = 'edited' | 'original'
type Toast = { severity: 'success' | 'error' | 'info'; message: string }

export default function App() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<Clip | null>(null)
  const [history, setHistory] = useState<{ past: Clip[]; present: Clip | null; future: Clip[] }>({
    past: [],
    present: null,
    future: [],
  })
  const [source, setSource] = useState<Source>('edited')
  const [selection, setSelection] = useState<Range | null>(null)
  const [params, setParams] = useState<EditParams>({ semitones: 0, stretch: 1, algorithm: 'wsola' })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const edited = history.present
  const shown = source === 'original' ? original : edited
  const player = usePlayer(shown)
  const duration = shown ? clipDuration(shown) : 0

  const loadFile = useCallback(async (file: File) => {
    try {
      const clip = await decodeFile(file)
      setFileName(file.name)
      setOriginal(clip)
      setHistory({ past: [], present: clip, future: [] })
      setClipboard(null)
      setSource('edited')
      setSelection(null)
    } catch (e) {
      setToast({ severity: 'error', message: `読み込めませんでした: ${file.name} (${String(e)})` })
    }
  }, [])

  // Accept drops anywhere on the page.
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files[0]
      if (file) void loadFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [loadFile])

  const apply = async () => {
    if (!edited) return
    setBusy(true)
    setProgress(0)
    try {
      const range = selection ?? { start: 0, end: clipDuration(edited) }
      const t0 = performance.now()
      const result = await applyEdit(edited, range, params.semitones, params.stretch, params.algorithm, setProgress)
      setHistory((h) => ({
        past: [...h.past, edited].slice(-HISTORY_LIMIT),
        present: result.clip,
        future: [],
      }))
      setSource('edited')
      setSelection(selection ? result.range : null)
      setParams((p) => ({ ...p, semitones: 0, stretch: 1 }))
      setToast({ severity: 'success', message: `適用しました（${((performance.now() - t0) / 1000).toFixed(2)}秒）` })
    } catch (e) {
      setToast({ severity: 'error', message: `処理に失敗しました: ${String(e)}` })
    } finally {
      setBusy(false)
    }
  }

  // Push a new clip onto the undo history.
  const commit = (clip: Clip) => {
    setHistory((h) => ({
      past: h.present ? [...h.past, h.present].slice(-HISTORY_LIMIT) : h.past,
      present: clip,
      future: [],
    }))
    setSource('edited')
  }

  const copy = () => {
    if (edited && selection) setClipboard(sliceClip(edited, selection))
  }
  const cut = () => {
    if (!edited || !selection) return
    setClipboard(sliceClip(edited, selection))
    commit(removeRange(edited, selection))
    player.seek(selection.start)
    setSelection(null)
  }
  const paste = () => {
    if (!edited || !clipboard) return
    const at = player.position
    commit(insertAt(edited, clipboard, at))
    setSelection({ start: at, end: at + clipDuration(clipboard) })
  }
  const trim = () => {
    if (!edited || !selection) return
    commit(sliceClip(edited, selection))
    player.seek(0)
    setSelection(null)
  }

  const undo = () =>
    setHistory((h) =>
      h.past.length && h.present
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
        : h,
    )
  const redo = () =>
    setHistory((h) =>
      h.future.length && h.present
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    )

  const exportWav = (format: WavFormat) => {
    setExportAnchor(null)
    if (!edited) return
    const url = URL.createObjectURL(encodeWav(edited, format))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName.replace(/\.[^.]+$/, '') || 'audio'}_wevocal.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const togglePlay = () => {
    if (player.playing) player.pause()
    else void player.play(player.position >= duration - 1e-3 ? 0 : player.position)
  }

  // Keyboard: Space = play/pause, Ctrl+Z / Ctrl+Y = undo/redo.
  const keyRef = useRef({ togglePlay, undo, redo, cut, copy, paste })
  keyRef.current = { togglePlay, undo, redo, cut, copy, paste }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && (k === 'x' || k === 'c' || k === 'v')) {
        e.preventDefault()
        if (k === 'x') keyRef.current.cut()
        else if (k === 'c') keyRef.current.copy()
        else keyRef.current.paste()
      } else if (e.code === 'Space') {
        e.preventDefault()
        keyRef.current.togglePlay()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) keyRef.current.redo()
        else keyRef.current.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        keyRef.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setSelectionField = (key: keyof Range, value: string) => {
    const v = Number(value)
    if (!Number.isFinite(v)) return
    const cur = selection ?? { start: 0, end: duration }
    const next = { ...cur, [key]: Math.max(0, Math.min(duration, v)) }
    setSelection(next.end > next.start ? next : null)
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Box component="span" sx={{ color: 'primary.main', display: 'flex' }}>
            <FontAwesomeIcon icon={faWaveSquare} />
          </Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            WeVocalSynth
          </Typography>
          <Tooltip title="元に戻す (Ctrl+Z)">
            <span>
              <IconButton aria-label="元に戻す" onClick={undo} disabled={!history.past.length || busy}>
                <FontAwesomeIcon icon={faRotateLeft} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="やり直す (Ctrl+Y)">
            <span>
              <IconButton aria-label="やり直す" onClick={redo} disabled={!history.future.length || busy}>
                <FontAwesomeIcon icon={faRotateRight} />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="outlined" startIcon={<FontAwesomeIcon icon={faFolderOpen} />} onClick={() => inputRef.current?.click()}>
            開く
          </Button>
          <Button
            variant="contained"
            startIcon={<FontAwesomeIcon icon={faDownload} />}
            disabled={!edited || busy}
            onClick={(e) => setExportAnchor(e.currentTarget)}
          >
            WAV出力
          </Button>
          <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => exportWav('pcm16')}>16-bit PCM</MenuItem>
            <MenuItem onClick={() => exportWav('pcm24')}>24-bit PCM</MenuItem>
            <MenuItem onClick={() => exportWav('float32')}>32-bit float</MenuItem>
          </Menu>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void loadFile(f)
              e.target.value = ''
            }}
          />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {!shown ? (
          <Paper
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            sx={{
              p: 8,
              textAlign: 'center',
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderRadius: 4,
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'background.paper',
            }}
          >
            <Box sx={{ color: 'primary.main', fontSize: 64 }}>
              <FontAwesomeIcon icon={faFileArrowUp} />
            </Box>
            <Typography variant="h6" sx={{ mt: 2 }}>
              音声ファイルをドロップ、またはクリックして選択
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              WAV推奨（MP3 / OGG / FLAC などブラウザが対応する形式も可）。ファイルはサーバーへ送信されません。
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 500 }} noWrap>
                      {fileName}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip size="small" label={`${shown.sampleRate} Hz`} />
                      <Chip size="small" label={shown.channels.length === 1 ? 'Mono' : `${shown.channels.length} ch`} />
                      <Chip size="small" label={formatTime(duration)} />
                    </Stack>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={source}
                      onChange={(_, v: Source | null) => v && setSource(v)}
                    >
                      <ToggleButton value="edited">加工後</ToggleButton>
                      <ToggleButton value="original">原音</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  <Waveform
                    clip={shown}
                    position={player.position}
                    playing={player.playing}
                    selection={source === 'edited' ? selection : null}
                    onSeek={player.seek}
                    onSelect={source === 'edited' ? setSelection : () => {}}
                  />

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Tooltip title="再生 / 一時停止 (Space)">
                        <IconButton aria-label="再生 / 一時停止" color="primary" size="large" onClick={togglePlay} sx={{ bgcolor: 'action.selected' }}>
                          {player.playing ? <FontAwesomeIcon icon={faPause} /> : <FontAwesomeIcon icon={faPlay} />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="停止">
                        <IconButton aria-label="停止"
                          onClick={() => {
                            player.pause()
                            player.seek(0)
                          }}
                        >
                          <FontAwesomeIcon icon={faStop} />
                        </IconButton>
                      </Tooltip>
                      <Button
                        startIcon={<FontAwesomeIcon icon={faCirclePlay} />}
                        disabled={!selection || source !== 'edited'}
                        onClick={() => selection && void player.play(selection.start, selection.end)}
                      >
                        選択範囲を試聴
                      </Button>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 170 }}>
                        {formatTime(player.position)} / {formatTime(duration)}
                      </Typography>
                    </Stack>
                    <Box sx={{ flexGrow: 1 }} />
                    {source === 'edited' && (
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                          size="small"
                          type="number"
                          label="開始 (秒)"
                          value={selection ? +selection.start.toFixed(3) : ''}
                          onChange={(e) => setSelectionField('start', e.target.value)}
                          slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                          sx={{ width: 120 }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="終了 (秒)"
                          value={selection ? +selection.end.toFixed(3) : ''}
                          onChange={(e) => setSelectionField('end', e.target.value)}
                          slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                          sx={{ width: 120 }}
                        />
                        <Tooltip title="切り取り (Ctrl+X)">
                          <span>
                            <IconButton aria-label="切り取り" disabled={!selection || busy} onClick={cut}>
                              <FontAwesomeIcon icon={faScissors} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="コピー (Ctrl+C)">
                          <span>
                            <IconButton aria-label="コピー" disabled={!selection || busy} onClick={copy}>
                              <FontAwesomeIcon icon={faCopy} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="再生位置に貼り付け (Ctrl+V)">
                          <span>
                            <IconButton aria-label="再生位置に貼り付け" disabled={!clipboard || busy} onClick={paste}>
                              <FontAwesomeIcon icon={faPaste} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="選択範囲のみ残す">
                          <span>
                            <IconButton aria-label="選択範囲のみ残す" disabled={!selection || busy} onClick={trim}>
                              <FontAwesomeIcon icon={faCropSimple} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="選択解除">
                          <span>
                            <IconButton aria-label="選択解除" disabled={!selection} onClick={() => setSelection(null)}>
                              <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    波形をドラッグで範囲選択、クリックで再生位置を移動。ホイールで横スクロール、Ctrl+ホイールで拡大縮小。
                    {source === 'original' && ' 原音表示中は比較試聴のみ可能です。'}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {source === 'edited' && edited && (
              <EditPanel
                params={params}
                onChange={setParams}
                targetDuration={selection ? selection.end - selection.start : clipDuration(edited)}
                hasSelection={!!selection}
                busy={busy}
                progress={progress}
                onApply={apply}
              />
            )}
          </Stack>
        )}
      </Container>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
