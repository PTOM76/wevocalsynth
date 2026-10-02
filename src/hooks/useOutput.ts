import type { Clip, Range } from '../audio/types'
import { applyFader } from '../audio/edit'
import { sliceRanges } from '../audio/multiRange'
import { mixClips } from '../audio/mix'
import { isAudible, toStoredSettings } from '../audio/tracks'
import { EXPORT_EXT, downloadBlob, exportAudio } from 'wevocal-lib'
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
}

/** プロジェクトの保存（.wvsp）と、音声ファイルの書き出し */
export function useOutput(d: Deps) {
  const { history, tracks } = d
  const baseName = d.fileName.replace(/\.[^.]+$/, '') || 'audio'
  // 書き出しの名前の初期値: ファイル名のままなら、元のファイルと区別できるよう _wevocal を付ける
  const exportName = d.named ? baseName : `${baseName}_wevocal`

  /** 全トラック（音声・フェーダー・鳴らし方・重ねる表示）と、選んでいるトラックを .wvsp にしてダウンロードする */
  const saveProjectFile = () =>
    d.task.run(t('task.saving'), async () => {
      if (!history.present) return
      const list = history.tracks.map((tr) => ({
        name: tr.name,
        original: tr.original,
        edited: tr.clip,
        ...toStoredSettings(tracks.settingsOf(tr.id)),
      }))
      const active = Math.max(0, history.tracks.findIndex((tr) => tr.id === history.activeId))
      downloadBlob(saveProject({ fileName: d.fileName, named: d.named, params: d.params, tempo: d.tempo, markers: d.markers, tracks: list, active }), `${baseName}${PROJECT_EXT}`)
      d.notify(t('toast.saved'))
    })

  /**
   * 書き出しダイアログの設定で音声ファイルを作る。選んでいるトラックか、全トラックのミックス。
   * 選択範囲のみなら、どのトラックも同じ時間を切り出す（複数の範囲はつなげる）
   */
  const exportFile = (s: ExportSettings) =>
    d.task.run(t('task.exporting'), async (signal) => {
      const edited = history.present
      if (!edited) return
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
      const blob = await exportAudio(clip, { ...s, range: null, sampleRate: s.sampleRate || clip.sampleRate }, d.task.setProgress)
      // MP3 などの Worker は止められないので、中断されていたら結果を捨てる
      if (signal.aborted) return
      downloadBlob(blob, `${s.fileName.trim()}${EXPORT_EXT[s.format]}`)
      d.closeExport()
      d.notify(t('toast.exported'))
    })

  return { baseName, exportName, saveProjectFile, exportFile }
}
