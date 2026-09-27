import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
} from '@mui/material'
import type { InitialMode, Settings } from './settings'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

/** 設定画面。変更はその場で反映・保存する */
export default function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>設定</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <FormControl>
            <FormControlLabel
              control={
                <Switch checked={settings.autoRestore} onChange={(e) => onChange({ autoRestore: e.target.checked })} />
              }
              label="作業を自動保存し、次回開いたときに復元する"
            />
            <FormHelperText>音声はこのブラウザ内（IndexedDB）にだけ保存され、送信されません</FormHelperText>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="initial-mode">ファイルを開いたときのモード</InputLabel>
            <Select
              labelId="initial-mode"
              label="ファイルを開いたときのモード"
              value={settings.initialMode}
              onChange={(e) => onChange({ initialMode: e.target.value as InitialMode })}
            >
              <MenuItem value="auto">自動判定</MenuItem>
              <MenuItem value="vocal">ボーカル</MenuItem>
              <MenuItem value="instrument">楽器</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
