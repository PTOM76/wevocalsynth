import { useEffect, useState } from 'react'
import { folderFileTarget, pickSaveTarget } from 'pevenmui/web'
import { renderVideo, VIDEO_EXT, VIDEO_MIME } from '../audio/video'
import { installedManifest, onAddonsChanged } from '../addons/addons'
import type { Clip } from '../audio/types'
import type { VideoExportSettings } from '../components/VideoExportDialog'
import type { VideoExportPrefs } from '../components/videoPrefs'
import type { useTask } from './useTask'
import { t } from '../i18n/i18n'

interface Deps {
  present: Clip | null
  /** 書き出す音声を作る（音声の書き出しと同じもの。useOutput） */
  renderClip: (edited: Clip, s: { selectionOnly: boolean; mix: boolean }) => Promise<Clip>
  prefs: VideoExportPrefs
  task: ReturnType<typeof useTask>
  /** 追加機能「変換」を確かめる（未導入なら導入の案内） */
  ensure: (id: string) => Promise<boolean>
  exportToFolder: boolean
  notify: (message: string) => void
}

/** 動画の書き出し（追加機能「変換」。memo/video-export.md） */
export function useVideoExport(d: Deps) {
  const [open, setOpen] = useState(false)
  // 追加機能を導入しているときだけメニューに出す（導入と削除は設定の「追加機能」）
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    const check = () => void installedManifest('converter').then((m) => setAvailable(!!m))
    check()
    return onAddonsChanged(check)
  }, [])

  /** 導入と版を確かめてからダイアログを開く（更新があれば案内する。やめたら開かない） */
  const openDialog = async () => {
    if (!d.present || !(await d.ensure('converter'))) return
    setOpen(true)
  }

  const exportVideo = async (s: VideoExportSettings, win?: Window | null) => {
    const edited = d.present
    if (!edited) return
    // 保存先は書き出しの前に選ぶ（音声の書き出しと同じ）
    const ext = VIDEO_EXT[s.container]
    const fileName = `${s.fileName.trim()}${ext}`
    const folder = d.exportToFolder ? await folderFileTarget('export', fileName, win ?? window) : null
    if (d.exportToFolder && !folder) return
    if (folder?.exists && !(win ?? window).confirm(t('export.overwrite', { name: folder.name }))) return
    const target = folder ?? (await pickSaveTarget(fileName, 'video', { description: t('video.fileType'), mime: VIDEO_MIME[s.container], ext }, win ?? window))
    if (!target) return
    const pr = d.prefs
    const [width, height] = pr.size.split('x').map(Number)
    await d.task.run(t('task.exporting'), async (signal) => {
      const clip = await d.renderClip(edited, s)
      const blob = await renderVideo(clip, {
        container: s.container,
        width,
        height,
        fps: 30,
        kbps: 192,
        background: { color: pr.bg, image: s.image, fit: pr.fit },
        wave: { style: pr.style, color: pr.wave, playedColor: pr.played, position: pr.position, height: 0.25 },
        title: pr.title ? s.fileName.trim() : '',
        titleColor: '#ffffff',
        onProgress: d.task.setProgress,
        signal,
      })
      await target.write(blob)
      setOpen(false)
      d.notify(folder ? t('export.savedTo', { name: folder.name, folder: folder.folder }) : t('toast.exported'))
    }, 'export')
  }

  return { open, setOpen, available, openDialog, exportVideo }
}
