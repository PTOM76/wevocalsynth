// ツールのコマンド（ボーカル抽出、音声の作成、録音、ピッチの道具）
import { canRecord } from 'wevocal-lib'
import { downloadBlob } from 'pevenmui/web'
import { exportMorae } from '../audio/kanaCut'
import { exportUtau, lineUp } from '../audio/kanaOut'
import { flattenPitch } from '../audio/pitchTools'
import { t } from '../i18n/i18n'
import { defineCommands, ready, selected, type CommandContext } from './types'

/** ZIP の名前の曲名の部分の最長（字）。展開するとこの名前のフォルダーができ、長いと Windows のパスの上限（260 字）を超えて展開できない */
const ZIP_BASE_MAX = 32

/** `base`（曲名）を短くして `suffix` を付けた ZIP の名前 */
const zipName = (base: string, suffix: string) => `${[...base].slice(0, ZIP_BASE_MAX).join('').trim()}_${suffix}.zip`

/** ピッチの道具は、ピッチを表示して解析が済んでから */
export const pitchReady = (c: CommandContext) => ready(c) && c.ed.showPitch && !!c.ed.pitch
/** ピッチの帯の曲線を動かせるか */
const curveReady = (c: CommandContext) => c.ed.showPitch && c.ed.editing && c.ed.pitchTools.ready && !c.ed.busy
/** ピッチを上げ下げできるか（曲線か、加工の欄のピッチ） */
const canNudge = (c: CommandContext) => c.ed.editing && !c.ed.busy
/** 曲線を動かせるなら曲線を `curve` 半音、そうでなければ加工の欄のピッチを `param` 半音（-24〜24） */
function nudgePitch(c: CommandContext, curve: number, param: number) {
  if (curveReady(c)) return c.ed.pitchTools.shift(curve)
  c.ed.setParams((p) => ({ ...p, semitones: Math.max(-24, Math.min(24, Math.round((p.semitones + param) * 100) / 100)) }))
}
// ピッチの強制表示と非表示は、選択範囲があるときだけ
const voicingReady = (c: CommandContext) => selected(c) && pitchReady(c)

/** 選んでいるトラックの一音ずつの範囲 */
const moraeOf = (c: CommandContext) => c.ed.tracks.moraeOf(c.ed.tracks.activeId)
const hasMorae = (c: CommandContext) => ready(c) && moraeOf(c).length > 0

export const toolCommands = defineCommands({
  extractVocals: { label: 'extract.vocalsMenu', enabled: ready, run: (c) => void c.ed.extract('vocals') },
  extractAccompaniment: { label: 'extract.accompanimentMenu', enabled: ready, run: (c) => void c.ed.extract('accompaniment') },
  splitStems: { label: 'extract.splitMenu', enabled: ready, run: (c) => void c.ed.splitStems() },
  splitLeadStems: { label: 'extract.splitLeadMenu', enabled: ready, run: (c) => void c.ed.splitLeadStems() },
  splitInstrumentStems: { label: 'extract.splitInstrumentsMenu', enabled: ready, run: (c) => void c.ed.splitInstrumentStems() },
  // 和音を分ける（試作。設定の試験的機能で表示する）
  splitVoicesByPitch: { label: 'voices.byPitchMenu', visible: (c) => c.settings.showVoiceSplit, enabled: ready, run: (c) => void c.ed.splitVoices('pitch') },
  splitVoicesByVolume: { label: 'voices.byVolumeMenu', visible: (c) => c.settings.showVoiceSplit, enabled: ready, run: (c) => void c.ed.splitVoices('volume') },
  sampler: { label: 'sampler.menu', enabled: ready, run: (c) => c.dialogs.open('sampler') },
  synth: { label: 'synth.menu', enabled: (c) => !c.ed.busy, run: (c) => c.dialogs.open('synth') },
  // 一音ずつ切り出す（memo/kana-cut.md）
  kanaCut: { label: 'kanaCut.menu', enabled: ready, run: (c) => c.dialogs.open('kanaCut') },
  exportMorae: {
    label: 'kanaCut.exportMenu',
    enabled: hasMorae,
    run: (c) => {
      const clip = c.ed.edited
      if (clip) void exportMorae(clip, moraeOf(c), c.settings.kanaKeepAll).then((zip) => downloadBlob(zip, zipName(c.ed.baseName, 'kana')))
    },
  },
  // 音ごとに 1 つを五十音順に並べた新しいトラック（範囲はそのトラックの読みの帯に付ける）
  lineUpMorae: {
    label: 'kanaCut.lineUpMenu',
    enabled: hasMorae,
    run: (c) => {
      const clip = c.ed.edited
      if (!clip) return
      const out = lineUp(clip, moraeOf(c), c.settings.kanaKeepAll)
      const id = c.ed.tracks.addClip(out.clip, t('kanaCut.lineUpTrack', { name: c.ed.baseName }))
      c.ed.tracks.setMorae(id, out.morae)
    },
  },
  exportUtau: {
    label: 'kanaCut.utauMenu',
    enabled: hasMorae,
    run: (c) => {
      const clip = c.ed.edited
      if (clip) void exportUtau(clip, moraeOf(c), c.ed.baseName, c.settings.kanaKeepAll).then((zip) => downloadBlob(zip, zipName(c.ed.baseName, 'voicebank')))
    },
  },
  // 書き出しに、短すぎる音や中身が読みと合わない音も入れる（既定は入れない）
  kanaKeepAll: { label: 'kanaCut.keepAllMenu', checked: (c) => c.settings.kanaKeepAll, enabled: hasMorae, run: (c) => c.update({ kanaKeepAll: !c.settings.kanaKeepAll }) },
  clearMorae: { label: 'kanaCut.clearMenu', enabled: hasMorae, run: (c) => c.ed.tracks.setMorae(c.ed.tracks.activeId, []) },
  record: { label: 'record.menu', enabled: (c) => !c.ed.busy && canRecord(), run: (c) => c.dialogs.open('record') },

  // ピッチの道具（右クリックでは、ピッチの帯のときだけ）
  // ↑↓: ピッチの帯で曲線を編集できるときは曲線（1 半音、Shift で 0.1 半音）、それ以外は加工の欄のピッチ（1 半音、Shift で 12 半音）
  pitchUp: { label: 'context.pitchUp', enabled: canNudge, keyOnlyWhenEnabled: true, run: (c) => nudgePitch(c, 1, 1) },
  pitchDown: { label: 'context.pitchDown', enabled: canNudge, keyOnlyWhenEnabled: true, run: (c) => nudgePitch(c, -1, -1) },
  pitchUpAlt: { label: 'key.pitchUpAlt', enabled: canNudge, keyOnlyWhenEnabled: true, run: (c) => nudgePitch(c, 0.1, 12) },
  pitchDownAlt: { label: 'key.pitchDownAlt', enabled: canNudge, keyOnlyWhenEnabled: true, run: (c) => nudgePitch(c, -0.1, -12) },
  flatten: {
    label: 'context.flatten',
    enabled: pitchReady,
    run: (c) => c.ed.pitchTools.edit((tg, f0, k0, k1) => flattenPitch(tg, f0, k0, k1, c.settings.flattenStrength)),
  },
  // ダイアログを開くものは「…」を付ける
  snap: { label: (_c, t) => `${t('snap.title')}…`, enabled: pitchReady, run: (c) => c.dialogs.open('pitchTool', 'snap') },
  vibrato: { label: (_c, t) => `${t('vibrato.title')}…`, enabled: pitchReady, run: (c) => c.dialogs.open('pitchTool', 'vibrato') },
  midi: { label: (_c, t) => `${t('midi.title')}…`, enabled: pitchReady, run: (c) => c.dialogs.open('pitchTool', 'midi') },
  voicingForce: { label: 'voicing.force', enabled: voicingReady, run: (c) => c.ed.voicing.set(c.ed.selections, 1) },
  voicingMute: { label: 'voicing.mute', enabled: voicingReady, run: (c) => c.ed.voicing.set(c.ed.selections, -1) },
  voicingReset: { label: 'voicing.reset', enabled: voicingReady, run: (c) => c.ed.voicing.set(c.ed.selections, 0) },
})
