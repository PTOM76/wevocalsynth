// ダイアログの開閉と、開くときに渡す値
import { useDialogs as usePevenDialogs, type Dialogs as PevenDialogs } from 'pevenmui'

/** App が開くダイアログ。足すときはここに名前を足し、AppDialogs.tsx に描画を置く */
export type DialogId =
  | 'shortcuts' | 'settings' | 'about' | 'licenses' | 'history' | 'synth' | 'sampler' | 'silence' | 'record' | 'repeat' | 'soundSelect' | 'eq' | 'tempoChange' | 'kanaCut'
  // 値を渡して開くもの: マーカーの名前の変更とテンポ（マーカーの id）、ピッチの一括操作（'snap' | 'vibrato' | 'midi'）
  | 'renameMarker' | 'markerTempo' | 'pitchTool'

/** ダイアログの開閉（PevenMUI の useDialogs。WeVocal Studio と共通） */
export const useDialogs = () => usePevenDialogs<DialogId>()
export type Dialogs = PevenDialogs<DialogId>
