import { useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { fadeRange, gainRange, insertAt, normalizeRange, silenceRange } from '../audio/edit'
import { mapRanges, normalizeRanges, removeRanges, sliceRanges } from '../audio/multiRange'
import type { VolumeAction } from '../components/VolumePanel'
import { t } from '../i18n/i18n'

interface Deps {
  /** 編集中のクリップ */
  edited: Clip | null
  /** 選択範囲（複数可、空なら未選択） */
  selections: Range[]
  setSelections: (rs: Range[]) => void
  /** 音量編集の対象（選択範囲、なければ全体） */
  editRanges: Range[]
  /** 再生位置（貼り付け先） */
  position: number
  seek: (t: number) => void
  commit: (clip: Clip) => void
  notify: (message: string) => void
}

/**
 * 切り取り・コピー・貼り付け・トリミングと音量編集。どれも即座に終わり、履歴に積む。
 * 複数範囲を選んでいる場合は全範囲が対象で、コピー・トリミングは範囲をつなげたものになる。
 */
export function useClipCommands(d: Deps) {
  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const { edited, selections, editRanges } = d
  const hasSel = selections.length > 0

  const copy = () => {
    if (edited && hasSel) setClipboard(sliceRanges(edited, selections))
  }
  const cut = () => {
    if (!edited || !hasSel) return
    setClipboard(sliceRanges(edited, selections))
    d.commit(removeRanges(edited, selections))
    d.seek(normalizeRanges(selections)[0].start)
    d.setSelections([])
  }
  const paste = () => {
    if (!edited || !clipboard) return
    const at = d.position
    d.commit(insertAt(edited, clipboard, at))
    d.setSelections([{ start: at, end: at + clipDuration(clipboard) }])
  }
  const trim = () => {
    if (!edited || !hasSel) return
    d.commit(sliceRanges(edited, selections))
    d.seek(0)
    d.setSelections([])
  }

  const gain = (db: number) => {
    if (edited && editRanges.length) d.commit(mapRanges(edited, editRanges, (c, r) => gainRange(c, r, db)))
  }
  const volume = (action: VolumeAction) => {
    if (!edited || !editRanges.length) return
    if (action === 'normalize') {
      // 範囲ごとにピークを揃える。無音の範囲はそのまま残す
      let fails = 0
      const next = mapRanges(edited, editRanges, (c, r) => normalizeRange(c, r) ?? (fails++, c))
      if (fails < editRanges.length) d.commit(next)
      else d.notify(t('toast.silentNormalize'))
    } else if (action === 'silence') {
      d.commit(mapRanges(edited, editRanges, silenceRange))
    } else {
      const dir = action === 'fadeIn' ? 'in' : 'out'
      d.commit(mapRanges(edited, editRanges, (c, r) => fadeRange(c, r, dir)))
    }
  }

  return {
    hasClipboard: !!clipboard,
    /** ファイルを開き直したときにクリップボードを空にする（サンプルレートが混ざらないように） */
    clearClipboard: () => setClipboard(null),
    copy,
    cut,
    paste,
    trim,
    gain,
    volume,
  }
}
