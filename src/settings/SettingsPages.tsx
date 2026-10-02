import type { ReactNode } from 'react'
import type { CtrlSAction, F0Voicing, InitialMode, Settings, ThemeSetting, VocalModel } from './settings'
import { NumberInput } from '../components/inspector/Inspector'
import { UpdateSection } from 'pevenmui/pwa'
import DataSection from './DataSection'
import AddonSection from './AddonSection'
import ProjectSection, { type ProjectSettings } from './ProjectSection'
import { VOCAL_MODELS } from '../hooks/useVocalExtract'
import { visibleAlgorithms } from '../components/AlgorithmMenu'
import type { Algorithm } from '../dsp/engine'
import type { LangSetting, MessageKey } from '../i18n/i18n'
import type { Category } from './settingsSearch'
import { Check, Choice, Group, LANG_NAMES, Row, type WindowMode } from 'pevenmui'

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
        </Group>
        <Group title={t('settings.groupHistory')}>
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
            help={t('settings.sliderResetHelp')}
          />
          <Check checked={draft.seekAfterInsert} onChange={(v) => set({ seekAfterInsert: v })} label={t('settings.seekAfterInsert')} />
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
        </Group>
        <Group title={t('settings.groupUpdate')}>
          <UpdateSection />
        </Group>
      </>
    ),
    defaults: (
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
        <Group title={t('settings.groupDefaultTempo')}>
          <Row label={t('settings.defaultBpm')} help={t('settings.defaultBpmHelp')}>
            <NumberInput value={draft.defaultBpm} onChange={(v) => set({ defaultBpm: Math.round(v * 100) / 100 })} min={20} max={300} step={1} unit="BPM" width={110} />
          </Row>
        </Group>
      </>
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
          <Row label={t('settings.vocalModel')}>
            <Choice<VocalModel>
              value={draft.vocalModel}
              onChange={(v) => set({ vocalModel: v })}
              options={[
                ['fp16', t('addon.modelLight')],
                ['int8', t('addon.modelStandard')],
                ['fp32', t('addon.modelPrecise')],
              ]}
            />
          </Row>
          <Check checked={draft.vocalGpu} onChange={(v) => set({ vocalGpu: v })} label={t('settings.vocalGpu')} help={t('settings.vocalGpuHelp')} />
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
        <Check checked={draft.fastMath} onChange={(v) => set({ fastMath: v })} label={t('settings.fastMath')} help={t('settings.fastMathHelp')} />
        <Check checked={draft.realtimeAlign} onChange={(v) => set({ realtimeAlign: v })} label={t('settings.realtimeAlign')} help={t('settings.realtimeAlignHelp')} />
        <Check checked={draft.suspendWhenStopped} onChange={(v) => set({ suspendWhenStopped: v })} label={t('settings.suspendWhenStopped')} help={t('settings.suspendWhenStoppedHelp')} />
        <Check checked={draft.playbackSession} onChange={(v) => set({ playbackSession: v })} label={t('settings.playbackSession')} help={t('settings.playbackSessionHelp')} />
        <Row label={t('settings.spliceFade')} help={t('settings.spliceFadeHelp')}>
          <Choice<string>
            value={String(draft.spliceFadeMs)}
            onChange={(v) => set({ spliceFadeMs: Number(v) })}
            options={['5', '10', '20'].map((ms): [string, string] => [ms, `${ms} ms`])}
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
    pitch: (
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
        <Check checked={draft.showBeatGrid} onChange={(v) => set({ showBeatGrid: v })} label={t('settings.showBeatGrid')} />
        <Check checked={draft.tempoStretch} onChange={(v) => set({ tempoStretch: v })} label={t('settings.tempoStretch')} help={t('settings.tempoStretchHelp')} />
      </Group>
    ),
    keys: (
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
    ),
  }
}
