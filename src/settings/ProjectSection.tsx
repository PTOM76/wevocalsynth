import { useEffect, useState } from 'react'
import { TextField, Typography } from '@mui/material'
import { NumberInput } from '../components/inspector/Inspector'
import type { ProjectTempo } from '../project/projectFile'
import { useT } from '../i18n/i18n'
import { Group, Row } from './controls'

/** 設定の「プロジェクト」に渡す、今のプロジェクトの値と変更の関数。ファイルを開いていなければ null */
export interface ProjectSettings {
  name: string
  tempo: ProjectTempo
  onRename: (name: string) => void
  onTempoChange: (patch: Partial<ProjectTempo>) => void
}

/**
 * 設定の「プロジェクト」: プロジェクト名とテンポ。アプリの設定と違ってプロジェクトファイルに入り、
 * 変えたらその場で反映する（OK・キャンセルの対象にしない）
 */
export default function ProjectSection({ project }: { project: ProjectSettings | null }) {
  const t = useT()
  const [name, setName] = useState(project?.name ?? '')
  useEffect(() => setName(project?.name ?? ''), [project?.name])
  if (!project) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('settings.projectEmpty')}</Typography>
  const commitName = () => {
    if (name.trim() && name.trim() !== project.name) project.onRename(name)
    else setName(project.name)
  }
  const { tempo, onTempoChange } = project
  return (
    <>
      <Group title={t('settings.groupProject')}>
        <Row label={t('project.name')}>
          <TextField
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            // Enter は名前を確定してから、設定画面の OK として扱う
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && commitName()}
            slotProps={{ htmlInput: { 'aria-label': t('project.name'), style: { fontSize: 13 } } }}
            sx={{ width: 240, maxWidth: '100%' }}
          />
        </Row>
      </Group>
      <Group title={t('settings.groupTempo')}>
        <Row label={t('settings.bpm')}>
          <NumberInput value={tempo.bpm} onChange={(v) => onTempoChange({ bpm: v })} min={20} max={400} step={0.01} unit="BPM" width={110} ariaLabel="BPM" />
        </Row>
        <Row label={t('settings.beatsPerBar')}>
          <NumberInput value={tempo.beatsPerBar} onChange={(v) => onTempoChange({ beatsPerBar: Math.round(v) })} min={1} max={16} step={1} width={110} />
        </Row>
        <Row label={t('settings.beatOffset')}>
          <NumberInput value={tempo.beatOffset} onChange={(v) => onTempoChange({ beatOffset: v })} min={0} max={60} step={0.001} unit={t('vibrato.secondUnit')} width={110} />
        </Row>
      </Group>
    </>
  )
}
