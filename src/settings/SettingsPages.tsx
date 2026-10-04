import type { ReactNode } from 'react'
import type { CtrlSAction, F0Voicing, InitialMode, Settings, ThemeSetting, VocalModel, WheelZoom } from './settings'
import { NumberInput } from '../components/inspector/Inspector'
import { UpdateSection } from 'pevenmui/pwa'
import DataSection from './DataSection'
import AddonSection from './AddonSection'
import ProjectSection, { type ProjectSettings } from './ProjectSection'
import { VOCAL_MODELS } from '../hooks/useVocalExtract'
import { isMdxModel, resolveModel } from '../audio/vocalExtract'
import { backendAllowed } from '../../extractor/src/compat'
import { visibleAlgorithms } from '../components/AlgorithmMenu'
import ExtractDiagnose from '../debug/ExtractDiagnose'
import OutputDeviceRow from './OutputDeviceRow'
import type { Algorithm } from '../dsp/engine'
import { t as translate, type LangSetting, type MessageKey } from '../i18n/i18n'
import type { Category } from './settingsSearch'
import type { PickerMode, StartFolder } from 'pevenmui/web'
import { Check, Choice, Group, LANG_NAMES, Row, type WindowMode } from 'pevenmui'

/** 画面の大きさの選択肢（倍率） */
const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5]

/** 抽出の実行環境のメモリの上限の選択肢（MB） */
const MEMORY_MB = [256, 512, 1024, 2048, 4096]

/** 設定の「ボーカル抽出」に並べる追加機能（モデル。実行環境はモデルと一緒に導入・削除するので出さない） */
const VOCAL_ADDONS = Object.values(VOCAL_MODELS).map((m) => m.addon)

interface PageProps {
  draft: Settings
  set: (patch: Partial<Settings>) => void
  onClose: () => void
  t: (key: MessageKey) => string
  project: ProjectSettings | null
}

/**
 * 設定画面の分類ごとの中身。項目を足したら settingsSearch.ts の検索の対象にも足す
 */
export function settingsPages({ draft, set, onClose, t, project }: PageProps): Record<Category, ReactNode> {
  // 既定の処理方式の選択肢（従来の方式は、表示する設定か、今選んでいるときだけ）
  const algorithmOptions = visibleAlgorithms(draft.showLegacyAlgorithms, [draft.vocalAlgorithm, draft.instrumentAlgorithm]).map(
    (a): [Algorithm, string] => [a.value, t(a.label)],
  )
  return {
    project: <ProjectSection project={project} />,
    general: (
      <>
        <Group title={t('settings.groupStartup')}>
          <Check
            checked={draft.autoRestore}
            onChange={(v) => set({ autoRestore: v })}
            label={t('settings.autoRestore')}
            help={t('settings.autoRestoreHelp')}
          />
          <Check checked={draft.confirmClose} onChange={(v) => set({ confirmClose: v })} label={t('settings.confirmClose')} help={t('settings.confirmCloseHelp')} />
        </Group>
        <Group title={t('settings.groupOutput')}>
          <OutputDeviceRow value={draft.outputDevice} onChange={(v) => set({ outputDevice: v })} />
        </Group>
        <Group title={t('settings.groupUpdate')}>
          <UpdateSection />
        </Group>
      </>
    ),
    process: (
      <>
        {/* ボーカル・楽器のボタン（と自動判定）で選ばれる処理方式 */}
        <Group title={t('settings.groupDefaultAlgorithm')}>
          <Row label={t('settings.vocalAlgorithm')}>
            <Choice<Algorithm> value={draft.vocalAlgorithm} onChange={(v) => set({ vocalAlgorithm: v })} options={algorithmOptions} />
          </Row>
          <Row label={t('settings.instrumentAlgorithm')}>
            <Choice<Algorithm> value={draft.instrumentAlgorithm} onChange={(v) => set({ instrumentAlgorithm: v })} options={algorithmOptions} />
          </Row>
          <Check checked={draft.showLegacyAlgorithms} onChange={(v) => set({ showLegacyAlgorithms: v })} label={t('settings.showLegacyAlgorithms')} help={t('settings.showLegacyAlgorithmsHelp')} />
        </Group>
        <Group title={t('settings.groupProcess')}>
          <Row label={t('settings.initialMode')}>
            <Choice<InitialMode>
              value={draft.initialMode}
              onChange={(v) => set({ initialMode: v })}
              options={[
                ['auto', t('settings.auto')],
                ['vocal', t('common.vocal')],
                ['instrument', t('common.instrument')],
              ]}
            />
          </Row>
          <Row label={t('settings.saveMemory')} help={t('settings.saveMemoryHelp')}>
            <Choice<Settings['saveMemory']>
              value={draft.saveMemory}
              onChange={(v) => set({ saveMemory: v })}
              options={[
                ['auto', t('settings.saveMemoryAuto')],
                ['on', t('settings.saveMemoryOn')],
                ['off', t('settings.saveMemoryOff')],
              ]}
            />
          </Row>
        </Group>
      </>
    ),
    edit: (
      <>
        <Group title={t('settings.groupHistory')}>
          <Check checked={draft.keepOriginal} onChange={(v) => set({ keepOriginal: v })} label={t('settings.keepOriginal')} help={t('settings.keepOriginalHelp')} />
          <Row label={t('settings.historyLimit')}>
            <NumberInput value={draft.historyLimit} onChange={(v) => set({ historyLimit: Math.round(v) })} min={1} max={500} step={1} width={110} />
          </Row>
          <Row label={t('settings.historyMemory')}>
            <NumberInput value={draft.historyMemoryMb} onChange={(v) => set({ historyMemoryMb: Math.round(v) })} min={64} max={4096} step={64} unit="MB" width={110} />
          </Row>
        </Group>
        <Group title={t('settings.groupInput')}>
          <Check
            checked={draft.sliderDoubleClickReset}
            onChange={(v) => set({ sliderDoubleClickReset: v })}
            label={t('settings.sliderReset')}
          />
          <Check checked={draft.seekAfterInsert} onChange={(v) => set({ seekAfterInsert: v })} label={t('settings.seekAfterInsert')} />
          <Row label={t('settings.wheelZoom')}>
            <Choice<WheelZoom>
              value={draft.wheelZoom}
              onChange={(v) => set({ wheelZoom: v })}
              options={[
                ['ctrl', t('settings.wheelZoomCtrl')],
                ['wheel', t('settings.wheelZoomWheel')],
              ]}
            />
          </Row>
        </Group>
        <Group title={t('settings.groupShortcuts')}>
          <Row label={t('settings.ctrlS')}>
            <Choice<CtrlSAction>
              value={draft.ctrlS}
              onChange={(v) => set({ ctrlS: v })}
              options={[
                ['project', t('settings.ctrlSProject')],
                ['export', t('settings.ctrlSExport')],
              ]}
            />
          </Row>
        </Group>
      </>
    ),
    file: (
      <Group title={t('settings.groupFile')}>
        <Check checked={draft.rememberFolder} onChange={(v) => set({ rememberFolder: v })} label={t('settings.rememberFolder')} help={t('settings.rememberFolderHelp')} />
        <Row label={t('settings.startFolder')}>
          <Choice<StartFolder>
            value={draft.startFolder}
            onChange={(v) => set({ startFolder: v })}
            options={[
              ['downloads', t('settings.folderDownloads')],
              ['documents', t('settings.folderDocuments')],
              ['desktop', t('settings.folderDesktop')],
              ['music', t('settings.folderMusic')],
            ]}
          />
        </Row>
        <Check checked={draft.recentFiles} onChange={(v) => set({ recentFiles: v })} label={t('settings.recentFiles')} help={t('settings.recentFilesHelp')} />
      </Group>
    ),
    display: (
      <Group title={t('settings.groupAppearance')}>
        <Row label={t('settings.theme')}>
          <Choice<ThemeSetting>
            value={draft.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              ['system', t('settings.themeSystem')],
              ['light', t('settings.themeLight')],
              ['dark', t('settings.themeDark')],
            ]}
          />
        </Row>
        <Row label={t('settings.uiScale')} help={t('settings.uiScaleHelp')}>
          <Choice<string>
            value={String(draft.uiScale)}
            onChange={(v) => set({ uiScale: Number(v) })}
            options={UI_SCALES.map((s): [string, string] => [String(s), `${Math.round(s * 100)}%`])}
          />
        </Row>
        <Check checked={draft.showMeters} onChange={(v) => set({ showMeters: v })} label={t('settings.showMeters')} help={t('settings.showMetersHelp')} />
        <Check checked={draft.liveSelection} onChange={(v) => set({ liveSelection: v })} label={t('settings.liveSelection')} help={t('settings.liveSelectionHelp')} />
        <Row label={t('settings.language')}>
          <Choice<LangSetting>
            value={draft.language}
            onChange={(v) => set({ language: v })}
            options={[['auto', t('settings.languageAuto')], ...LANG_NAMES]}
          />
        </Row>
      </Group>
    ),
    vocal: (
      <>
        <Group title={t('settings.groupVocal')}>
          <Row
            label={t('settings.vocalModel')}
            // この端末で使えないか向かないモデルは、抽出のときに代わりのモデルを使う。MDX-Net は CPU だととても遅いので知らせる
            help={
              resolveModel(draft.vocalModel, draft.vocalGpu).replaced
                ? translate('settings.vocalModelReplaced', { from: t(VOCAL_MODELS[draft.vocalModel].label), name: t(VOCAL_MODELS[resolveModel(draft.vocalModel, draft.vocalGpu).model].label) })
                : isMdxModel(draft.vocalModel) && (!draft.vocalGpu || !('gpu' in navigator))
                  ? t('settings.vocalSlowCpu')
                  : undefined
            }
          >
            <Choice<VocalModel>
              value={draft.vocalModel}
              onChange={(v) => set({ vocalModel: v })}
              options={(Object.keys(VOCAL_MODELS) as VocalModel[]).map((m): [VocalModel, string] => [m, t(VOCAL_MODELS[m].label)])}
            />
          </Row>
          <Check checked={draft.vocalFreshExtract} onChange={(v) => set({ vocalFreshExtract: v })} label={t('settings.vocalFresh')} help={t('settings.vocalFreshHelp')} />
          {/* GPU を使えないモデルでは押せなくし、理由を出す */}
          <Check
            checked={draft.vocalGpu && backendAllowed(draft.vocalModel, 'webgpu')}
            disabled={!backendAllowed(draft.vocalModel, 'webgpu')}
            onChange={(v) => set({ vocalGpu: v })}
            label={t('settings.vocalGpu')}
            help={backendAllowed(draft.vocalModel, 'webgpu') ? t('settings.vocalGpuHelp') : t('settings.vocalGpuUnsupported')}
          />
          <Check
            checked={draft.vocalKeepHighBand}
            onChange={(v) => set({ vocalKeepHighBand: v })}
            label={t('settings.vocalKeepHighBand')}
            help={t('settings.vocalKeepHighBandHelp')}
          />
        </Group>
        <Group title={t('settings.groupAddons')}>
          <AddonSection ids={VOCAL_ADDONS} />
        </Group>
      </>
    ),
    data: (
      <Group title={t('settings.groupData')}>
        <DataSection onClose={onClose} />
      </Group>
    ),

    debug: (
      <Group title={t('settings.groupDebug')}>
        <Check checked={draft.showDebug} onChange={(v) => set({ showDebug: v })} label={t('settings.showDebug')} help={t('settings.showDebugHelp')} />
        <Check checked={draft.devUpdates} onChange={(v) => set({ devUpdates: v })} label={t('settings.devUpdates')} help={t('settings.devUpdatesHelp')} />
        <Check checked={draft.showMaterialButton} onChange={(v) => set({ showMaterialButton: v })} label={t('settings.showMaterialButton')} help={t('settings.showMaterialButtonHelp')} />
        <Row label={t('settings.filePicker')} help={t('settings.filePickerHelp')}>
          <Choice<PickerMode>
            value={draft.filePicker}
            onChange={(v) => set({ filePicker: v })}
            options={[
              ['auto', t('settings.filePickerAuto')],
              ['api', t('settings.filePickerApi')],
              ['input', t('settings.filePickerInput')],
            ]}
          />
        </Row>
        <Row label={t('settings.dialogWindow')}>
          <Choice<WindowMode | 'auto'>
            value={draft.dialogWindow}
            onChange={(v) => set({ dialogWindow: v })}
            options={[
              ['auto', t('settings.auto')],
              ['dialog', t('settings.windowDialog')],
              ['nativeDialog', '<dialog>'],
              ['popover', 'Popover API'],
              ['popup', t('settings.windowPopup')],
              ['tab', t('settings.windowTab')],
              ['window', t('settings.windowSub')],
              ['pip', 'PiP'],
            ]}
          />
        </Row>
      </Group>
    ),
    debugAudio: (
      <Group title={t('settings.groupDebugAudio')}>
        <Check
          checked={draft.showExperimentalAlgorithms}
          onChange={(v) => set({ showExperimentalAlgorithms: v })}
          label={t('settings.showExperimentalAlgorithms')}
          help={t('settings.showExperimentalAlgorithmsHelp')}
        />
        <Check checked={draft.fastMath} onChange={(v) => set({ fastMath: v })} label={t('settings.fastMath')} help={t('settings.fastMathHelp')} />
        <Check checked={draft.realtimeAlign} onChange={(v) => set({ realtimeAlign: v })} label={t('settings.realtimeAlign')} help={t('settings.realtimeAlignHelp')} />
        <Row label={t('settings.spliceFade')} help={t('settings.spliceFadeHelp')}>
          <Choice<string>
            value={String(draft.spliceFadeMs)}
            onChange={(v) => set({ spliceFadeMs: Number(v) })}
            options={['5', '10', '20'].map((ms): [string, string] => [ms, `${ms} ms`])}
          />
        </Row>
        <Check checked={draft.suspendWhenStopped} onChange={(v) => set({ suspendWhenStopped: v })} label={t('settings.suspendWhenStopped')} help={t('settings.suspendWhenStoppedHelp')} />
        <Check checked={draft.playbackSession} onChange={(v) => set({ playbackSession: v })} label={t('settings.playbackSession')} help={t('settings.playbackSessionHelp')} />
      </Group>
    ),
    diagnose: (
      <Group title={t('settings.groupDiagnose')}>
        <Row label={t('settings.vocalMemory')} help={t('settings.vocalMemoryHelp')}>
          <Choice<string>
            value={String(draft.vocalMemoryMb)}
            onChange={(v) => set({ vocalMemoryMb: Number(v) })}
            options={MEMORY_MB.map((mb): [string, string] => [String(mb), mb < 1024 ? `${mb} MB` : `${mb / 1024} GB`])}
          />
        </Row>
        <ExtractDiagnose options={{ model: draft.vocalModel, gpu: draft.vocalGpu, keepHighBand: draft.vocalKeepHighBand, memoryMb: draft.vocalMemoryMb }} />
      </Group>
    ),    pitch: (
      <Group title={t('settings.groupPitch')}>
        <Row label={t('settings.f0MinHz')}>
          <NumberInput value={draft.f0MinHz} onChange={(v) => set({ f0MinHz: Math.round(v) })} min={40} max={400} step={1} unit="Hz" width={110} />
        </Row>
        <Row label={t('settings.f0MaxHz')}>
          <NumberInput value={draft.f0MaxHz} onChange={(v) => set({ f0MaxHz: Math.round(v) })} min={200} max={2000} step={10} unit="Hz" width={110} />
        </Row>
        <Row label={t('settings.f0Voicing')}>
          <Choice<F0Voicing>
            value={draft.f0Voicing}
            onChange={(v) => set({ f0Voicing: v })}
            options={[
              ['strict', t('settings.f0Strict')],
              ['normal', t('settings.f0Normal')],
              ['loose', t('settings.f0Loose')],
            ]}
          />
        </Row>
        <Row label={t('settings.f0SilenceDb')}>
          <NumberInput value={draft.f0SilenceDb} onChange={(v) => set({ f0SilenceDb: Math.round(v) })} min={-80} max={-20} step={1} unit="dB" width={110} />
        </Row>
      </Group>
    ),
    tempo: (
      <Group title={t('settings.groupTempo')}>
        <Check checked={draft.autoTempo} onChange={(v) => set({ autoTempo: v })} label={t('settings.autoTempo')} help={t('settings.autoTempoHelp')} />
        <Row label={t('settings.defaultBpm')} help={t('settings.defaultBpmHelp')}>
          <NumberInput value={draft.defaultBpm} onChange={(v) => set({ defaultBpm: Math.round(v * 100) / 100 })} min={20} max={300} step={1} unit="BPM" width={110} />
        </Row>
        <Check checked={draft.showBeatGrid} onChange={(v) => set({ showBeatGrid: v })} label={t('settings.showBeatGrid')} />
        <Check checked={draft.tempoStretch} onChange={(v) => set({ tempoStretch: v })} label={t('settings.tempoStretch')} help={t('settings.tempoStretchHelp')} />
      </Group>
    ),
  }
}
