// 多言語化（訳文の JSON をまとめて t() を出す）
import { createI18n } from 'pevenmui'
import ja from './ja_jp.json'
import en from './en_us.json'
import ko from './ko_kr.json'
import zhCn from './zh_cn.json'
import zhTw from './zh_tw.json'

/**
 * 多言語化（PevenMUI の createI18n）。訳文は言語ごとの JSON（Minecraft 風に ja_jp / en_us）に置き、
 * ビルド時にバンドルへ取り込むので実行時の読み込み待ちはない。
 * キーは ja_jp.json を正とし、ほかの言語に欠けたキーがあると型エラーになる。
 */
export const i18n = createI18n({
  base: 'ja_jp',
  fallback: 'en_us',
  messages: { ja_jp: ja, en_us: en, ko_kr: ko, zh_cn: zhCn, zh_tw: zhTw },
})

export type Lang = typeof i18n.Lang
export type LangSetting = 'auto' | Lang
export type MessageKey = typeof i18n.Key

/** 訳文を返す。React の外（Canvas 描画やエラーメッセージ）からも使用できる */
export const { t, useT, useLang, LangContext } = i18n

/** 設定値から実際の言語を決める（auto はブラウザの言語に従う） */
export const resolveLang = i18n.resolve
export const setLang = i18n.setLang
