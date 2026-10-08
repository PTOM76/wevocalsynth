// ツールのコマンド（ボーカル抽出、音声の作成、録音、ピッチの道具）
import { canRecord } from 'wevocal-lib'
import { flattenPitch } from '../audio/pitchTools'
import { defineCommands, ready, selected, type CommandContext } from './types'

/** ピッチの道具は、ピッチを表示して解析が済んでから */
export const pitchReady = (c: CommandContext) => ready(c) && c.ed.showPitch && !!c.ed.pitch
// ピッチの強制表示と非表示は、選択範囲があるときだけ
const voicingReady = (c: CommandContext) => selected(c) && pitchReady(c)

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
  record: { label: 'record.menu', enabled: (c) => !c.ed.busy && canRecord(), run: (c) => c.dialogs.open('record') },

  // ピッチの道具（右クリックでは、ピッチの帯のときだけ）
  pitchUp: { label: 'context.pitchUp', enabled: pitchReady, run: (c) => c.ed.pitchTools.shift(1) },
  pitchDown: { label: 'context.pitchDown', enabled: pitchReady, run: (c) => c.ed.pitchTools.shift(-1) },
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
