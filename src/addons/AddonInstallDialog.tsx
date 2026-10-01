import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from '@mui/material'
import { ADDONS, addonSize, fetchManifest, install, installedManifest, type AddonManifest } from './addons'
import { requestPersist } from '../project/storage'
import { useT } from '../i18n/i18n'

const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`

interface State {
  id: string
  manifest: AddonManifest | null
  progress: number | null
  error: string | null
  resolve: (ok: boolean) => void
}

/**
 * 追加機能の導入。`request(id)` で確認ダイアログを出し、導入できたら true を返す。
 * `ensure(id)` は導入済みならダイアログを出さずに true を返す（機能を使う直前に呼ぶ）。
 * 返す `dialog` を画面のどこかに置く
 */
export function useAddonInstall() {
  const t = useT()
  const [state, setState] = useState<State | null>(null)
  const abort = useRef<AbortController | null>(null)

  const request = (id: string) =>
    new Promise<boolean>((resolve) => {
      setState({ id, manifest: null, progress: null, error: null, resolve })
      fetchManifest(id).then(
        (manifest) => setState((s) => s && { ...s, manifest }),
        (e) => setState((s) => s && { ...s, error: t('addon.unavailable', { error: String(e) }) }),
      )
    })

  const ensure = async (id: string) => ((await installedManifest(id)) ? true : request(id))

  const close = (ok: boolean) => {
    abort.current?.abort()
    abort.current = null
    state?.resolve(ok)
    setState(null)
  }

  const run = async () => {
    if (!state?.manifest) return
    const ctrl = new AbortController()
    abort.current = ctrl
    setState({ ...state, progress: 0, error: null })
    try {
      await install(state.manifest, (p) => setState((s) => s && { ...s, progress: p }), ctrl.signal)
      // 数十MBを取り直さずに済むよう、消されにくくする申請もしておく（断られても使える）
      void requestPersist()
      abort.current = null
      close(true)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setState((s) => s && { ...s, progress: null, error: t('addon.failed', { error: String(e) }) })
    }
  }

  const info = ADDONS.find((a) => a.id === state?.id)
  const busy = state?.progress != null

  const dialog = (
    <Dialog open={!!state} onClose={() => !busy && close(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('addon.installTitle')}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 14 }}>{t('addon.installText', { name: info ? t(info.name) : (state?.id ?? '') })}</Typography>
        <Typography sx={{ fontSize: 13, mt: 1 }}>
          {state?.manifest ? t('addon.downloadSize', { size: mb(addonSize(state.manifest)) }) : !state?.error && t('addon.checking')}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>{t('addon.installHelp')}</Typography>
        {busy && (
          <>
            <LinearProgress variant="determinate" value={(state.progress ?? 0) * 100} sx={{ mt: 2 }} />
            <Typography sx={{ fontSize: 12, mt: 0.5 }}>{t('addon.downloading', { percent: Math.round((state.progress ?? 0) * 100) })}</Typography>
          </>
        )}
        {state?.error && <Typography sx={{ fontSize: 12, color: 'error.main', mt: 1.5 }}>{state.error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => close(false)}>
          {t('common.cancel')}
        </Button>
        <Button size="small" variant="contained" disabled={!state?.manifest || busy} onClick={() => void run()}>
          {t('addon.install')}
        </Button>
      </DialogActions>
    </Dialog>
  )

  return { request, ensure, dialog }
}
