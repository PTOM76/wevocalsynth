import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from '@mui/material'
import { ADDONS, addonSize, fetchManifest, installedManifest, withRequires, type AddonManifest } from './addons'
import { cancelDownload, installAll, isDownloading, useDownload } from './downloads'
import { useT } from '../i18n/i18n'
import { pevenFont } from 'pevenmui'

const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`

interface State {
  id: string
  /** 導入するもの（依存を含む）。取得できるまでは null */
  manifests: AddonManifest[] | null
  /** `id` がすでに入っていて、新しい版に入れ替えるか（ダイアログの文言を「更新」にする） */
  updating: boolean
  /** ダウンロード中か（進み具合は downloads.ts が持つ） */
  downloading: boolean
  /** ダウンロード中に閉じた（ダウンロードは続け、終わったら resolve する） */
  hidden: boolean
  error: string | null
  resolve: (ok: boolean) => void
}

/** `ids` の導入に要るもののうち、未導入か配信中と版が違うもののマニフェストと、`id`（最初のもの）がすでに入っているか */
async function plan(ids: string[], force: boolean): Promise<{ manifests: AddonManifest[]; updating: boolean }> {
  const id = ids[0]
  const manifests: AddonManifest[] = []
  let updating = false
  for (const a of new Set(ids.flatMap(withRequires))) {
    const [installed, latest] = await Promise.all([installedManifest(a), fetchManifest(a)])
    if (a === id) updating = !!installed
    if (!installed || installed.version !== latest.version || (force && a === id)) manifests.push(latest)
  }
  return { manifests, updating }
}

/**
 * 追加機能の導入。`request(id)` で確認ダイアログを出し、導入できたら true を返す（依存するものも一緒に入れる）。
 * `ensure(id, also)` は依存を含めて導入済みならダイアログを出さずに true を返す（機能を使う直前に呼ぶ）。`also` は一緒に要るもの（実行環境など）。
 * ダウンロード中に閉じても続き（進み具合はステータスバー）、終わったら resolve する。返す `dialog` を画面のどこかに置く
 */
export function useAddonInstall() {
  const t = useT()
  const [state, setState] = useState<State | null>(null)
  const download = useDownload()

  /** `force` なら `id` は版が同じでも入れ直す（設定の「導入」）。偽なら未導入か古いものだけ入れる */
  const request = (id: string, force = true, also: string[] = []) =>
    new Promise<boolean>((resolve) => {
      setState({ id, manifests: null, updating: false, downloading: false, hidden: false, error: null, resolve })
      plan([id, ...also], force).then(
        ({ manifests, updating }) => setState((s) => s && { ...s, manifests, updating }),
        (e) => setState((s) => s && { ...s, error: t('addon.unavailable', { error: String(e) }) }),
      )
    })

  /**
   * 依存を含めて導入済みで、配信中と同じ版なら true。未導入か古い版があれば、導入・更新の確認ダイアログを出す
   * （古い実行環境のままだと、アプリが使う関数が無くて失敗するため）。オフラインで配信中の版が分からなければ、今ある版で使う
   */
  const ensure = async (id: string, also: string[] = []) => {
    const stale = await Promise.all(
      [...new Set([id, ...also].flatMap(withRequires))].map(async (a) => {
        const installed = await installedManifest(a)
        if (!installed) return true
        const latest = await fetchManifest(a).catch(() => null)
        return !!latest && latest.version !== installed.version
      }),
    )
    return stale.some(Boolean) ? request(id, false, also) : true
  }

  const close = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }

  const run = async () => {
    if (!state?.manifests) return
    // ほかの追加機能を取得中なら、終わるまで待ってもらう
    if (isDownloading()) return setState({ ...state, error: t('addon.busy') })
    const { resolve } = state
    setState({ ...state, downloading: true, error: null })
    try {
      await installAll(state.manifests, name(mainId))
      resolve(true)
      setState(null)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        resolve(false)
        setState(null)
        return
      }
      // 閉じていても、失敗は見えるように出し直す
      setState((s) => s && { ...s, downloading: false, hidden: false, error: t('addon.failed', { error: String(e) }) })
    }
  }
  const name = (id: string) => {
    const info = ADDONS.find((a) => a.id === id)
    return info ? t(info.name) : id
  }
  const busy = !!state?.downloading
  const progress = download?.progress ?? 0
  const size = state?.manifests?.reduce((s, m) => s + addonSize(m), 0) ?? 0
  // 依存するものも一緒に入れるときは、その名前も出す
  // 文言の主語: 入れ替えるものに `id` が含まれていればそれ、依存だけ（実行環境だけが古いなど）なら最初のもの
  const mainId = state?.manifests?.some((m) => m.id === state.id) ? state.id : (state?.manifests?.[0]?.id ?? state?.id ?? '')
  const extra = state?.manifests?.filter((m) => m.id !== mainId).map((m) => name(m.id)) ?? []
  /** ダウンロード中に閉じる（ダウンロードは続ける） */
  const hide = () => setState((s) => s && { ...s, hidden: true })

  const dialog = (
    <Dialog open={!!state && !state.hidden} onClose={() => (busy ? hide() : close(false))} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: pevenFont('xl'), py: 1.5 }}>{t(state?.updating ? 'addon.updateTitle' : 'addon.installTitle')}</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: pevenFont('lg') }}>{t(state?.updating ? 'addon.updateText' : 'addon.installText', { name: state ? name(mainId) : '' })}</Typography>
        {extra.length > 0 && <Typography sx={{ fontSize: pevenFont('base'), mt: 1 }}>{t(state?.updating ? 'addon.updateWith' : 'addon.installWith', { names: extra.join('、') })}</Typography>}
        <Typography sx={{ fontSize: pevenFont('base'), mt: 1 }}>
          {state?.manifests ? t('addon.downloadSize', { size: mb(size) }) : !state?.error && t('addon.checking')}
        </Typography>
        <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'text.secondary', mt: 1 }}>{t('addon.installHelp')}</Typography>
        {busy && (
          <>
            <LinearProgress variant="determinate" value={progress * 100} sx={{ mt: 2 }} />
            <Typography sx={{ fontSize: pevenFont('md'), mt: 0.5 }}>{t('addon.downloading', { percent: Math.round(progress * 100) })}</Typography>
            <Typography sx={{ fontSize: pevenFont('md'), color: 'text.secondary', mt: 0.5 }}>{t('addon.background')}</Typography>
          </>
        )}
        {state?.error && <Typography className="selectable" sx={{ fontSize: pevenFont('md'), color: 'error.main', mt: 1.5 }}>{state.error}</Typography>}
      </DialogContent>
      <DialogActions>
        {busy ? (
          <>
            <Button size="small" color="error" onClick={cancelDownload}>
              {t('task.cancel')}
            </Button>
            <Button size="small" onClick={hide}>
              {t('common.close')}
            </Button>
          </>
        ) : (
          <>
            <Button size="small" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="small" disabled={!state?.manifests} onClick={() => void run()}>
              {t(state?.updating ? 'addon.update' : 'addon.install')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )

  return { request, ensure, dialog }
}
