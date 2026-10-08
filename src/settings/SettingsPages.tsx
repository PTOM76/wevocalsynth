import type { ReactNode } from 'react'
import type { Settings, VocalModel } from './settings'
import { UpdateSection } from 'pevenmui/pwa'
import DataSection from './DataSection'
import AddonSection from './AddonSection'
import ProjectSection, { type ProjectSettings } from './ProjectSection'
import { VOCAL_MODELS } from '../hooks/useVocalExtract'
import { EXTRACT_MODELS } from '../audio/vocalExtract'
import { isMdxModel, resolveModel } from '../audio/vocalExtract'
import { backendAllowed } from '../../extractor/src/compat'
import { visibleAlgorithms } from '../components/AlgorithmMenu'
import ExtractDiagnose from '../debug/ExtractDiagnose'
import OutputDeviceRow from './OutputDeviceRow'
import SettingRow from './items/SettingRow'
import ShortcutSection from './ShortcutSection'
import type { Algorithm } from '../dsp/engine'
import { i18n, t as translate, type LangSetting, type MessageKey } from '../i18n/i18n'
import type { Category } from './settingsSearch'
import { Box, Button, Typography } from '@mui/material'
import { Check, Choice, Group, Row, type WindowMode, pevenFont } from 'pevenmui'

/** 設定の「ボーカル抽出」に並べる追加機能（モデル。実行環境はモデルと一緒に導入・削除するので出さない） */
const VOCAL_ADDONS = Object.values(VOCAL_MODELS).map((m) => m.addon)

interface PageProps {
  draft: Settings
  set: (patch: Partial<Settings>) => void
  onClose: () => void
  t: (key: MessageKey) => string
  project: ProjectSettings | null
  /** 別の分類を開く */
  go: (category: Category) => void
}

/**
 * 設定画面の分類ごとの中身。定義（items/）のある項目は S('名前') の 1 行で置け、検索の対象にも自動で入る
 */
export function settingsPages({ draft, set, onClose, t, project, go }: PageProps): Record<Category, ReactNode> {
  // 定義（items/）から作る行
  const S = (name: keyof Settings) => <SettingRow name={name} draft={draft} set={set} t={t} />
  // 既定の処理方式の選択肢（従来の方式は、表示する設定か、今選んでいるときだけ）
  const algorithmOptions = visibleAlgorithms(draft.showLegacyAlgorithms, [draft.vocalAlgorithm, draft.instrumentAlgorithm]).map(
    (a): [Algorithm, string] => [a.value, t(a.label)],
  )
  return {
    project: <ProjectSection project={project} />,
    general: (
      <>
        <Group title={t('settings.groupStartup')}>
          {S('autoRestore')}
          {S('confirmClose')}
        </Group>
        <Group title={t('settings.groupOutput')}>
          <OutputDeviceRow value={draft.outputDevice} onChange={(v) => set({ outputDevice: v })} />
        </Group>
        <Group title={t('settings.groupRecord')}>
          {S('recordEchoCancellation')}
          {S('recordNoiseSuppression')}
          {S('recordAutoGain')}
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
          {S('showLegacyAlgorithms')}
        </Group>
        <Group title={t('settings.groupProcess')}>
          {S('initialMode')}
          {S('saveMemory')}
        </Group>
      </>
    ),
    edit: (
      <>
        <Group title={t('settings.groupHistory')}>
          {S('keepOriginal')}
          {S('historyLimit')}
          {S('historyMemoryMb')}
        </Group>
        <Group title={t('settings.groupInput')}>
          {S('sliderDoubleClickReset')}
          {S('seekAfterInsert')}
        </Group>
      </>
    ),
    keys: (
      <>
        <Group title={t('settings.groupMouse')}>
          {S('wheelZoom')}
        </Group>
        <Group title={t('settings.groupShortcuts')}>
          {S('ctrlS')}
          <ShortcutSection keymap={draft.keymap} ctrlS={draft.ctrlS} onChange={(keymap) => set({ keymap })} />
        </Group>
      </>
    ),
    file: (
      <Group title={t('settings.groupFile')}>
        {S('rememberFolder')}
        {S('startFolder')}
        {S('recentFiles')}
      </Group>
    ),
    display: (
      <Group title={t('settings.groupAppearance')}>
        {S('theme')}
        {S('mobileUi')}
        {draft.mobileUi === 'new' && S('touchSelect')}
        {S('uiScale')}
        {S('showMeters')}
        {S('minimapPlayhead')}
        {S('liveSelection')}
        <Row label={t('settings.language')}>
          <Choice<LangSetting>
            value={draft.language}
            onChange={(v) => set({ language: v })}
            options={[['auto', t('settings.languageAuto')], ...i18n.options()]}
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
              options={EXTRACT_MODELS.map((m): [VocalModel, string] => [m, t(VOCAL_MODELS[m].label)])}
            />
          </Row>
          {S('vocalFreshExtract')}
          {/* GPU を使えないモデルでは押せなくし、理由を出す */}
          <Check
            checked={draft.vocalGpu && backendAllowed(draft.vocalModel, 'webgpu')}
            disabled={!backendAllowed(draft.vocalModel, 'webgpu')}
            onChange={(v) => set({ vocalGpu: v })}
            label={t('settings.vocalGpu')}
            help={backendAllowed(draft.vocalModel, 'webgpu') ? t('settings.vocalGpuHelp') : t('settings.vocalGpuUnsupported')}
          />
          {S('vocalKeepHighBand')}
          {/* 抽出の動きを変える設定なので、診断ではなくここに置く（iPad などで抽出できないときに下げる） */}
          {S('vocalMemoryMb')}
        </Group>
        <Group title={t('settings.groupAddons')}>
          {/* 追加機能の一覧（AddonSection）と同じく、説明は左、ボタンは右 */}
          <Box sx={{ gridColumn: '1 / -1', width: '100cqi', maxWidth: '100cqi', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: pevenFont('base') }}>{t('settings.addonsMoved')}</Typography>
            <Button size="small" variant="outlined" onClick={() => go('addons')} sx={{ flexShrink: 0 }}>
              {t('settings.openAddons')}
            </Button>
          </Box>
        </Group>
      </>
    ),
    addons: (
      <>
        <Group title={t('settings.groupAddonVocal')}>
          <AddonSection ids={VOCAL_ADDONS} />
        </Group>
        <Group title={t('settings.groupAddonAnalyzer')}>
          <AddonSection ids={['analyzer']} />
        </Group>
        <Group title={t('settings.groupAddonConverter')}>
          <AddonSection ids={['converter']} />
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
        {S('showDebug')}
        {S('devUpdates')}
        {S('showMaterialButton')}
        {S('filePicker')}
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
        {S('fastMath')}
        {S('realtimeAlign')}
        {S('spliceFadeMs')}
        {S('suspendWhenStopped')}
        {S('playbackSession')}
      </Group>
    ),
    experimental: (
      <Group title={t('settings.groupExperimental')}>
        {S('showExperimentalAlgorithms')}
        {S('showVoiceSplit')}
        {S('showKanaVoice')}
        {draft.showKanaVoice && S('kanaStrength')}
        {S('parallelProcess')}
      </Group>
    ),
    diagnose: (
      <Group title={t('settings.groupDiagnose')}>
        <ExtractDiagnose options={{ model: draft.vocalModel, gpu: draft.vocalGpu, keepHighBand: draft.vocalKeepHighBand, memoryMb: draft.vocalMemoryMb }} />
      </Group>
    ),
    pitch: (
      <Group title={t('settings.groupPitch')}>
        {S('f0MinHz')}
        {S('f0MaxHz')}
        {S('f0Voicing')}
        {S('flattenStrength')}
        {S('f0SilenceDb')}
      </Group>
    ),
    tempo: (
      <Group title={t('settings.groupTempo')}>
        {S('autoTempo')}
        {S('defaultBpm')}
        {S('showBeatGrid')}
        {S('tempoStretch')}
      </Group>
    ),
  }
}
