// 進み具合のゲージに表示する処理の種類
import { startJob as start } from 'pevenmui'

/** 進んでいる処理の大まかな種類（ゲージに出す名前は i18n の job.kind.*） */
export type JobKind = 'download' | 'load' | 'process' | 'extract' | 'analyze' | 'export' | 'save'

/** 処理を一覧に足す（PevenMUI の startJob に、このアプリの種類の型を付けたもの） */
export const startJob = (kind: JobKind, label: string, cancel?: () => void) => start(kind, label, cancel)
