// 表示のコマンド（帯の表示、拡大縮小、追従）
import { ZOOM_STEP } from 'wevocal-lib/react'
import { defineCommands, opened, selected, type CommandContext } from './types'

const pitchShown = (c: CommandContext) => opened(c) && c.ed.showPitch
const scale = (c: CommandContext, dir: 1 | -1) => c.view.setWaveScale(Math.min(64, Math.max(1, dir > 0 ? c.view.waveScale * 2 : c.view.waveScale / 2)))

export const viewCommands = defineCommands({
  spectrogram: { label: 'menu.spectrogram', checked: (c) => c.ed.showSpec, enabled: opened, run: (c) => void c.ed.setShowSpec(!c.ed.showSpec) },
  // 帯は 1 つは表示しておく（波形しかないときは消せない）
  wave: {
    label: 'menu.wave',
    checked: (c) => c.ed.showWave,
    enabled: (c) => opened(c) && !(c.ed.showWave && !c.ed.showPitch && !c.ed.showSpec && !c.ed.showGain && !c.ed.showFormant),
    run: (c) => c.ed.setShowWave(!c.ed.showWave),
  },
  pitch: { label: 'menu.pitch', checked: (c) => c.ed.showPitch, enabled: opened, run: (c) => c.ed.setShowPitch(!c.ed.showPitch) },
  gain: { label: 'menu.gain', checked: (c) => c.ed.showGain, enabled: opened, run: (c) => c.ed.setShowGain(!c.ed.showGain) },
  formant: { label: 'menu.formant', checked: (c) => c.ed.showFormant, enabled: opened, run: (c) => c.ed.setShowFormant(!c.ed.showFormant) },
  // ピッチの線と音符は、どちらか一方は残す
  pitchLine: {
    label: 'menu.pitchLine',
    checked: (c) => c.settings.showPitchLine || !c.settings.showNotes,
    enabled: (c) => pitchShown(c) && c.settings.showNotes,
    run: (c) => c.update({ showPitchLine: !c.settings.showPitchLine }),
  },
  notes: {
    label: 'menu.notes',
    checked: (c) => c.settings.showNotes,
    enabled: (c) => pitchShown(c) && !(c.settings.showNotes && !c.settings.showPitchLine),
    run: (c) => c.update({ showNotes: !c.settings.showNotes }),
  },
  overlayPitch: { label: 'menu.overlayPitch', checked: (c) => c.settings.overlayPitch, enabled: pitchShown, run: (c) => c.update({ overlayPitch: !c.settings.overlayPitch }) },
  minimap: { label: 'menu.minimap', checked: (c) => c.settings.minimap, enabled: opened, run: (c) => c.update({ minimap: !c.settings.minimap }) },
  followPlayhead: { label: 'wave.follow', checked: (c) => c.settings.followPlayhead, run: (c) => c.update({ followPlayhead: !c.settings.followPlayhead }) },

  zoomIn: {
    label: 'wave.zoomIn',
    hint: (c) => (c.settings.wheelZoom === 'wheel' ? 'Wheel' : 'Ctrl+Wheel'),
    enabled: (c) => opened(c) && c.view.ctl.canZoomIn,
    // 選択範囲があれば、その真ん中を中心に拡大する
    run: (c) => c.view.ctl.zoomAround(ZOOM_STEP, c.ed.selection ? (c.ed.selection.start + c.ed.selection.end) / 2 : c.view.center),
  },
  zoomOut: { label: 'wave.zoomOut', enabled: (c) => opened(c) && c.view.ctl.zoomed, run: (c) => c.view.ctl.zoomAround(1 / ZOOM_STEP, c.view.center) },
  showAll: { label: 'wave.showAll', enabled: (c) => opened(c) && c.view.ctl.zoomed, run: (c) => c.view.ctl.showAll() },
  zoomSelection: {
    label: 'wave.zoomSelection',
    enabled: selected,
    run: (c) => {
      const s = c.ed.selection
      if (s) c.view.ctl.setRange(s.start - (s.end - s.start) * 0.05, (s.end - s.start) * 1.1)
    },
  },
  vZoomIn: { label: 'wave.vZoomIn', hint: () => 'Alt+Wheel', enabled: (c) => c.view.waveScale < 64, run: (c) => scale(c, 1) },
  vZoomOut: { label: 'wave.vZoomOut', enabled: (c) => c.view.waveScale > 1, run: (c) => scale(c, -1) },
  vZoomReset: { label: 'wave.vZoomReset', enabled: (c) => c.view.waveScale !== 1, run: (c) => c.view.setWaveScale(1) },
})
