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
import type { CtrlSAction, InitialMode, Settings, ThemeSetting } from './settings'
import { useT, type LangSetting } from '../i18n/i18n'

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

/** 設定画面。変更はその場で反映・保存する */
export default function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  const t = useT()
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <FormControl>
            <FormControlLabel
              control={
                <Switch checked={settings.autoRestore} onChange={(e) => onChange({ autoRestore: e.target.checked })} />
              }
              label={t('settings.autoRestore')}
            />
            <FormHelperText>{t('settings.autoRestoreHelp')}</FormHelperText>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="initial-mode">{t('settings.initialMode')}</InputLabel>
            <Select
              labelId="initial-mode"
              label={t('settings.initialMode')}
              value={settings.initialMode}
              onChange={(e) => onChange({ initialMode: e.target.value as InitialMode })}
            >
              <MenuItem value="auto">{t('settings.auto')}</MenuItem>
              <MenuItem value="vocal">{t('common.vocal')}</MenuItem>
              <MenuItem value="instrument">{t('common.instrument')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="ctrl-s">{t('settings.ctrlS')}</InputLabel>
            <Select
              labelId="ctrl-s"
              label={t('settings.ctrlS')}
              value={settings.ctrlS}
              onChange={(e) => onChange({ ctrlS: e.target.value as CtrlSAction })}
            >
              <MenuItem value="project">{t('settings.ctrlSProject')}</MenuItem>
              <MenuItem value="export">{t('settings.ctrlSExport')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="theme">{t('settings.theme')}</InputLabel>
            <Select
              labelId="theme"
              label={t('settings.theme')}
              value={settings.theme}
              onChange={(e) => onChange({ theme: e.target.value as ThemeSetting })}
            >
              <MenuItem value="system">{t('settings.themeSystem')}</MenuItem>
              <MenuItem value="light">{t('settings.themeLight')}</MenuItem>
              <MenuItem value="dark">{t('settings.themeDark')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="language">{t('settings.language')}</InputLabel>
            <Select
              labelId="language"
              label={t('settings.language')}
              value={settings.language}
              onChange={(e) => onChange({ language: e.target.value as LangSetting })}
            >
              <MenuItem value="auto">{t('settings.languageAuto')}</MenuItem>
              <MenuItem value="ja_jp">日本語</MenuItem>
              <MenuItem value="en_us">English</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
