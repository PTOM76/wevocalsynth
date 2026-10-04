import { useState } from 'react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { fadeRange, gainRange, insertAt, normalizeRange, panRange, reverseRange, silenceRange } from '../audio/edit'
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
  /** 今の再生位置（貼り付け先）。再生中も正しい位置を返す */
  getPosition: () => number
  seek: (t: number) => void
  commit: (clip: Clip, label: string) => void
  notify: (message: string) => void
  /** 貼り付け・無音の挿入のあと、再生位置を入れた範囲の終わりへ移す */
  seekAfterInsert: boolean
}

/**
 * 切り取り・コピー・貼り付け・トリミングと音量編集。どれも即座に終わり、履歴に積む。
 * 複数範囲を選んでいる場合は全範囲が対象で、コピー・トリミングは範囲をつなげたものになる。
 */
/** パンの表記（L50 / C / R30 など） */
export const panLabel = (pan: number) => (Math.abs(pan) < 0.005 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`)

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
    d.commit(removeRanges(edited, selections), t('edit.cut'))
    d.seek(normalizeRanges(selections)[0].start)
    d.setSelections([])
  }
  /** 選択範囲を取り除く（切り取りと違い、クリップボードには入れない。Delete キー） */
  const remove = () => {
    if (!edited || !hasSel) return
    d.commit(removeRanges(edited, selections), t('edit.delete'))
    d.seek(normalizeRanges(selections)[0].start)
    d.setSelections([])
  }
  const paste = () => {
    if (!edited || !clipboard) return
    // サンプルレートの違うトラックに貼ると、高さと長さがずれる（トラックごとに元のファイルのレートのまま持つため）
    if (clipboard.sampleRate !== edited.sampleRate) {
      d.notify(t('toast.pasteRateMismatch', { from: clipboard.sampleRate, to: edited.sampleRate }))
      return
    }
    const at = d.getPosition()
    d.commit(insertAt(edited, clipboard, at), t('history.paste'))
    d.setSelections([{ start: at, end: at + clipDuration(clipboard) }])
    if (d.seekAfterInsert) d.seek(at + clipDuration(clipboard))
  }
  const trim = () => {
    if (!edited || !hasSel) return
    d.commit(sliceRanges(edited, selections), t('edit.trim'))
    d.seek(0)
    d.setSelections([])
  }

  /** ゲイン（dB）とパン（-1〜1）をまとめて適用する（どちらか一方だけでもよい）。履歴には1つの操作として積む */
  const gain = (db: number, pan = 0) => {
    if (!edited || !editRanges.length || (db === 0 && pan === 0)) return
    let next = edited
    const parts: string[] = []
    if (db !== 0) {
      next = mapRanges(next, editRanges, (c, r) => gainRange(c, r, db))
      parts.push(`${t('volume.gain')} ${db > 0 ? '+' : ''}${db.toFixed(1)}dB`)
    }
    if (pan !== 0) {
      next = mapRanges(next, editRanges, (c, r) => panRange(c, r, pan))
      parts.push(`${t('volume.pan')} ${panLabel(pan)}`)
    }
    d.commit(next, parts.join('・'))
  }
  const volume = (action: VolumeAction) => {
    if (!edited || !editRanges.length) return
    if (action === 'normalize') {
      // 範囲ごとにピークを揃える。無音の範囲はそのまま残す
      let fails = 0
      const next = mapRanges(edited, editRanges, (c, r) => normalizeRange(c, r) ?? (fails++, c))
      if (fails < editRanges.length) d.commit(next, t('volume.normalize'))
      else d.notify(t('toast.silentNormalize'))
    } else if (action === 'silence') {
      d.commit(mapRanges(edited, editRanges, silenceRange), t('volume.silence'))
    } else {
      const dir = action === 'fadeIn' ? 'in' : 'out'
      d.commit(mapRanges(edited, editRanges, (c, r) => fadeRange(c, r, dir)), t(dir === 'in' ? 'volume.fadeIn' : 'volume.fadeOut'))
    }
  }

  /** `at`（秒）に `sec` 秒の無音を差し込む（後ろはずれる） */
  const insertSilence = (at: number, sec: number) => {
    if (!edited || !(sec > 0)) return
    const n = Math.round(sec * edited.sampleRate)
    const silent = { sampleRate: edited.sampleRate, channels: edited.channels.map(() => new Float32Array(n)) }
    d.commit(insertAt(edited, silent, at), t('silence.title'))
    d.setSelections([{ start: at, end: at + sec }])
    if (d.seekAfterInsert) d.seek(at + sec)
  }

  /** 最後に選んだ範囲を、全部で `count` 回になるよう後ろに続けて並べる（後ろはずれる）。連打やループ素材づくり用 */
  const repeat = (count: number) => {
    const r = selections[selections.length - 1]
    if (!edited || !r || count < 2) return
    const piece = sliceRanges(edited, [r])
    const n = piece.channels[0].length
    const copies = { sampleRate: edited.sampleRate, channels: piece.channels.map((c) => {
      const out = new Float32Array(n * (count - 1))
      for (let i = 0; i < count - 1; i++) out.set(c, i * n)
      return out
    }) }
    d.commit(insertAt(edited, copies, r.end), t('repeat.history', { n: count }))
    const len = n / edited.sampleRate
    d.setSelections([{ start: r.start, end: r.start + len * count }])
  }

  /** 選択範囲（なければ全体）を逆再生にする（範囲ごとに前後を逆に並べる） */
  const reverse = () => {
    if (!edited || !editRanges.length) return
    d.commit(mapRanges(edited, editRanges, reverseRange), t('edit.reverse'))
  }

  return {
    hasClipboard: !!clipboard,
    reverse,
    repeat,
    insertSilence,
    /** ファイルを開き直したときにクリップボードを空にする（サンプルレートが混ざらないように） */
    clearClipboard: () => setClipboard(null),
    copy,
    cut,
    remove,
    paste,
    trim,
    gain,
    volume,
  }
}
