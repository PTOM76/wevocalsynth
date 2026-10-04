import { finishClip, type FinishOptions } from '../audio/finish'
import type { Clip, Range } from '../audio/types'
import { applyFader } from '../audio/edit'
import { sliceRanges } from '../audio/multiRange'
import { mixClips } from '../audio/mix'
import { isAudible, toStoredSettings } from '../audio/tracks'
import { EXPORT_EXT, exportAudio, type ExportFormat } from 'wevocal-lib'
import { folderFileTarget, overwriteTarget, pickSaveTarget, type SavedFile } from 'pevenmui/web'
import { restoreClip } from '../audio/originalStore'
import { PROJECT_EXT, saveProject } from '../project/projectFile'
import type { ExportSettings } from '../components/ExportDialog'
import type { EditParams } from '../components/EditPanel'
import type { useHistory } from './useHistory'
import type { useTracks } from './useTracks'
import type { useTask } from './useTask'
import type { Marker, ProjectTempo } from '../project/projectFile'
import { t } from '../i18n/i18n'

interface Deps {
  fileName: string
  /** プロジェクト名を自分で変えたか（変えていなければ、書き出しの名前に _wevocal を付ける） */
  named: boolean
  params: EditParams
  tempo: ProjectTempo
  markers: Marker[]
  history: ReturnType<typeof useHistory>
  tracks: ReturnType<typeof useTracks>
  selections: Range[]
  task: ReturnType<typeof useTask>
  notify: (message: string) => void
  /** 書き出し終わったらダイアログを閉じる */
  closeExport: () => void
  /** 保存・書き出しが終わったとき（閉じるときの保存確認の基準を更新する） */
  onSaved?: () => void
  /** 上書き保存するプロジェクトのファイル（開いたとき、保存したときに入れる） */
  projectFile: { current: SavedFile | null }
  /** 音声の書き出しは、書き出しダイアログの保存先フォルダーとファイル名へ保存する（フォルダーを扱えるブラウザのとき） */
  exportToFolder: boolean
  /** 書き出しの仕上げ（ノーマライズ、両端のフェード） */
  finish: FinishOptions
}

/** 書き出す形式ごとの MIME（保存先を選ぶ画面の、ファイルの種類） */
const EXPORT_MIME: Record<ExportFormat, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', opus: 'audio/ogg' }

/** プロジェクトの保存（.wvsp）と、音声ファイルの書き出し */
export function useOutput(d: Deps) {
  const { history, tracks } = d
  const baseName = d.fileName.replace(/\.[^.]+$/, '') || 'audio'
  // 書き出しの名前の初期値: ファイル名のままなら、元のファイルと区別できるよう _wevocal を付ける
  const exportName = d.named ? baseName : `${baseName}_wevocal`

  /**
   * 全トラック（音声・フェーダー・鳴らし方・重ねる表示）と、選んでいるトラックを .wvsp にして保存する。
   * 開いた、または前に保存したファイルがあれば上書きし、なければ（`asNew` も）保存先を先に選ぶ
   */
  const saveProjectFile = async (asNew = false) => {
    if (!history.present) return
    const prev = !asNew && d.projectFile.current
    const target =
      (prev && (await overwriteTarget(prev, true))) ||
      (await pickSaveTarget(`${baseName}${PROJECT_EXT}`, 'project', { description: t('file.projectType'), mime: 'application/octet-stream', ext: PROJECT_EXT }, window, true))
    if (!target) return
    d.projectFile.current = target.file ?? null
    await d.task.run(t('task.saving'), async () => {
      // 退避した原音（メモリの節約）は戻してから保存する
      for (const tr of history.tracks) await restoreClip(tr.original)
      const list = history.tracks.map((tr) => ({
        name: tr.name,
        original: tr.original,
        edited: tr.clip,
        ...toStoredSettings(tracks.settingsOf(tr.id)),
      }))
      const active = Math.max(0, history.tracks.findIndex((tr) => tr.id === history.activeId))
      await target.write(saveProject({ fileName: d.fileName, named: d.named, params: d.params, tempo: d.tempo, markers: d.markers, tracks: list, active }))
      d.onSaved?.()
      d.notify(t('toast.saved'))
    }, 'save')
  }

  /**
   * 書き出しダイアログの設定で音声ファイルを作る。選んでいるトラックか、全トラックのミックス。
   * 選択範囲のみなら、どのトラックも同じ時間を切り出す（複数の範囲はつなげる）
   */
  /** `win` は書き出しボタンを押したウィンドウ（保存先の画面はそこから出す） */
  const exportFile = async (s: ExportSettings, win?: Window | null) => {
    const edited = history.present
    if (!edited) return
    // 保存先は書き出しの前に選ぶ（エンコードに時間がかかると、選ぶ画面を出せなくなる）
    const ext = EXPORT_EXT[s.format]
    const fileName = `${s.fileName.trim()}${ext}`
    // フォルダーを扱えるブラウザ（Chrome・Edge）では、編集ソフトの書き出しのように、ダイアログの保存先フォルダーとファイル名へ書き込む。
    // フォルダーが未選択ならここで選び、同じ名前のファイルがあれば上書きしてよいか確かめる。扱えないブラウザはダウンロード
    const folder = d.exportToFolder ? await folderFileTarget('export', fileName, win ?? window) : null
    if (d.exportToFolder && !folder) return
    if (folder?.exists && !(win ?? window).confirm(t('export.overwrite', { name: folder.name }))) return
    const target = folder ?? (await pickSaveTarget(fileName, 'audio', { description: t('file.audioType'), mime: EXPORT_MIME[s.format], ext }, win ?? window))
    if (!target) return
    await d.task.run(t('task.exporting'), async (signal) => {
      // トラックのフェーダー（音量・パン）は、再生と同じく書き出しにも掛ける
      const render = (c: Clip, id: string) => {
        const part = s.selectionOnly && d.selections.length ? sliceRanges(c, d.selections) : c
        const f = tracks.faderOf(id)
        return applyFader(part, f.db, f.pan, f.invert)
      }
      // ミックス: 再生と同じく、ミュート・ソロに従って鳴るトラックだけを混ぜる（サンプルレートは選んでいるトラックに合わせる）
      const audible = history.tracks.filter((tr) => isAudible(tr.id, tracks.mix, history.tracks))
      let clip = render(edited, history.activeId)
      if (s.mix && history.tracks.length > 1 && audible.length) {
        const parts = audible.map((tr) => render(tr.clip, tr.id))
        clip = await mixClips(parts, edited.sampleRate, Math.max(...parts.map((c) => c.channels.length)))
      }
      clip = finishClip(clip, d.finish)
      const blob = await exportAudio(clip, { ...s, range: null, sampleRate: s.sampleRate || clip.sampleRate }, d.task.setProgress)
      // MP3 などの Worker は止められないので、中断されていたら結果を捨てる
      if (signal.aborted) return
      await target.write(blob)
      d.onSaved?.()
      d.closeExport()
      d.notify(folder ? t('export.savedTo', { name: folder.name, folder: folder.folder }) : t('toast.exported'))
    }, 'export')
  }

  return { baseName, exportName, saveProjectFile, exportFile }
}
