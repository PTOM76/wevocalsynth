import { pevenFont } from 'pevenmui'

/** 画面の大きさの選択肢（倍率） */
export const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5]

/** 抽出の実行環境のメモリの上限の選択肢（MB） */
export const MEMORY_MB = [256, 512, 1024, 2048, 4096]

/** 加工と音量の欄の、小さいボタン（×0.5、フェードインなど） */
export const SMALL_BUTTON_SX = { minWidth: 0, height: 26, px: 1, fontSize: pevenFont('md') } as const
