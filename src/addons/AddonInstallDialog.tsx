import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from '@mui/material'
import { ADDONS, addonSize, fetchManifest, install, installedManifest, withRequires, type AddonManifest } from './addons'
import { requestPersist } from '../project/storage'
import { useT } from '../i18n/i18n'

const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`

interface State {
  id: string
  /** 導入するもの（依存を含む）。取得できるまでは null */
  manifests: AddonManifest[] | null
  progress: number | null
  error: string | null
  resolve: (ok: boolean) => void
}

/** `id` の導入に要るもののうち、未導入か配信中と版が違うもののマニフェスト */
async function plan(id: string, force: boolean): Promise<AddonManifest[]> {
  const out: AddonManifest[] = []
  for (const a of withRequires(id)) {
    const [installed, latest] = await Promise.all([installedManifest(a), fetchManifest(a)])
    if (!installed || installed.version !== latest.version || (force && a === id)) out.push(latest)
  }
  return out
}

/**
 * 追加機能の導入。`request(id)` で確認ダイアログを出し、導入できたら true を返す（依存するものも一緒に入れる）。
 * `ensure(id)` は依存を含めて導入済みならダイアログを出さずに true を返す（機能を使う直前に呼ぶ）。
 * 返す `dialog` を画面のどこかに置く
 */
export function useAddonInstall() {
  const t = useT()
  const [state, setState] = useState<State | null>(null)
  const abort = useRef<AbortController | null>(null)

  const request = (id: string) =>
    new Promise<boolean>((resolve) => {
      setState({ id, manifests: null, progress: null, error: null, resolve })
      plan(id, true).then(
        (manifests) => setState((s) => s && { ...s, manifests }),
        (e) => setState((s) => s && { ...s, error: t('addon.unavailable', { error: String(e) }) }),
      )
    })

  const ensure = async (id: string) => {
    const missing = await Promise.all(withRequires(id).map(async (a) => !(await installedManifest(a))))
    return missing.some(Boolean) ? request(id) : true
  }

  const close = (ok: boolean) => {
    abort.current?.abort()
    abort.current = null
    state?.resolve(ok)
    setState(null)
  }

  const run = async () => {
    if (!state?.manifests) return
    const ctrl = new AbortController()
    abort.current = ctrl
    setState({ ...state, progress: 0, error: null })
    // 全体の大きさに対する進捗にする
    const total = state.manifests.reduce((s, m) => s + addonSize(m), 0) || 1
    let before = 0
    try {
      for (const m of state.manifests) {
        await install(m, (p) => setState((s) => s && { ...s, progress: (before + p * addonSize(m)) / total }), ctrl.signal)
        before += addonSize(m)
      }
      // 数十MBを取り直さずに済むよう、消されにくくする申請もしておく（断られても使える）
      void requestPersist()
      abort.current = null
      close(true)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setState((s) => s && { ...s, progress: null, error: t('addon.failed', { error: String(e) }) })
    }
  }

  const name = (id: string) => {
    const info = ADDONS.find((a) => a.id === id)
    return info ? t(info.name) : id
  }
  const busy = state?.progress != null
  const size = state?.manifests?.reduce((s, m) => s + addonSize(m), 0) ?? 0
  // 依存するものも一緒に入れるときは、その名前も出す
  const extra = state?.manifests?.filter((m) => m.id !== state.id).map((m) => name(m.id)) ?? []

  const dialog = (
    <Dialog open={!!state} onClose={() => !busy && close(false)} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 16, py: 1.5 }}>{t('addon.installTitle')}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 14 }}>{t('addon.installText', { name: state ? name(state.id) : '' })}</Typography>
        {extra.length > 0 && <Typography sx={{ fontSize: 13, mt: 1 }}>{t('addon.installWith', { names: extra.join('、') })}</Typography>}
        <Typography sx={{ fontSize: 13, mt: 1 }}>
          {state?.manifests ? t('addon.downloadSize', { size: mb(size) }) : !state?.error && t('addon.checking')}
        </Typography>
        <Typography className="selectable" sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>{t('addon.installHelp')}</Typography>
        {busy && (
          <>
            <LinearProgress variant="determinate" value={(state.progress ?? 0) * 100} sx={{ mt: 2 }} />
            <Typography sx={{ fontSize: 12, mt: 0.5 }}>{t('addon.downloading', { percent: Math.round((state.progress ?? 0) * 100) })}</Typography>
          </>
        )}
        {state?.error && <Typography className="selectable" sx={{ fontSize: 12, color: 'error.main', mt: 1.5 }}>{state.error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => close(false)}>
          {t('common.cancel')}
        </Button>
        <Button size="small" variant="contained" disabled={!state?.manifests || busy} onClick={() => void run()}>
          {t('addon.install')}
        </Button>
      </DialogActions>
    </Dialog>
  )

  return { request, ensure, dialog }
}
