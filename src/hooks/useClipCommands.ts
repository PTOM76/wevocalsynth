import { useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { fadeRange, gainRange, insertAt, normalizeRange, removeRange, silenceRange, sliceClip } from '../audio/edit'
import type { VolumeAction } from '../components/VolumePanel'

interface Deps {
  /** 編集中のクリップ */
  edited: Clip | null
  selection: Range | null
  setSelection: (r: Range | null) => void
  /** 音量編集の対象（選択範囲、なければ全体） */
  editRange: Range | null
  /** 再生位置（貼り付け先） */
  position: number
  seek: (t: number) => void
  commit: (clip: Clip) => void
  notify: (message: string) => void
}

/** 切り取り・コピー・貼り付け・トリミングと音量編集。どれも即座に終わり、履歴に積む */
export function useClipCommands(d: Deps) {
  const [clipboard, setClipboard] = useState<Clip | null>(null)
  const { edited, selection, editRange } = d

  const copy = () => {
    if (edited && selection) setClipboard(sliceClip(edited, selection))
  }
  const cut = () => {
    if (!edited || !selection) return
    setClipboard(sliceClip(edited, selection))
    d.commit(removeRange(edited, selection))
    d.seek(selection.start)
    d.setSelection(null)
  }
  const paste = () => {
    if (!edited || !clipboard) return
    const at = d.position
    d.commit(insertAt(edited, clipboard, at))
    d.setSelection({ start: at, end: at + clipDuration(clipboard) })
  }
  const trim = () => {
    if (!edited || !selection) return
    d.commit(sliceClip(edited, selection))
    d.seek(0)
    d.setSelection(null)
  }

  const gain = (db: number) => {
    if (edited && editRange) d.commit(gainRange(edited, editRange, db))
  }
  const volume = (action: VolumeAction) => {
    if (!edited || !editRange) return
    if (action === 'normalize') {
      const next = normalizeRange(edited, editRange)
      if (next) d.commit(next)
      else d.notify('無音のためノーマライズできません')
    } else if (action === 'silence') {
      d.commit(silenceRange(edited, editRange))
    } else {
      d.commit(fadeRange(edited, editRange, action === 'fadeIn' ? 'in' : 'out'))
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
