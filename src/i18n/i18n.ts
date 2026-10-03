import { createContext, useContext } from 'react'
import ja from './ja_jp.json'
import en from './en_us.json'
import ko from './ko_kr.json'
import zhCn from './zh_cn.json'
import zhTw from './zh_tw.json'
import { detectLang, HTML_LANG, type PevenLang } from 'pevenmui'

/**
 * 多言語化。訳文は言語ごとの JSON（Minecraft 風に ja_jp / en_us）に置き、
 * ビルド時にバンドルへ取り込むので実行時の読み込み待ちはない。
 * キーは ja_jp.json を正とし、ほかの言語に欠けたキーがあると型エラーになる。
 */
export type Lang = PevenLang
export type LangSetting = 'auto' | Lang
export type MessageKey = keyof typeof ja

const DICTS: Record<Lang, Record<MessageKey, string>> = {
  ja_jp: ja,
  en_us: en satisfies Record<MessageKey, string>,
  ko_kr: ko satisfies Record<MessageKey, string>,
  zh_cn: zhCn satisfies Record<MessageKey, string>,
  zh_tw: zhTw satisfies Record<MessageKey, string>,
}

/** 表示中の言語。React の外（Canvas 描画やエラーメッセージ）からも `t()` で使う */
let current: Lang = 'ja_jp'

/** 設定値から実際の言語を決める（auto はブラウザの言語に従う） */
export function resolveLang(setting: LangSetting): Lang {
  if (setting !== 'auto') return setting
  return detectLang()
}

export function setLang(lang: Lang) {
  current = lang
  // 変わったときだけ書く。同じ値でも書くとページ全体のスタイルの計算し直しになり、App の描き直しのたびに重かった
  if (typeof document !== 'undefined' && document.documentElement.lang !== HTML_LANG[lang]) document.documentElement.lang = HTML_LANG[lang]
}

/** 訳文を返す。`{name}` は `vars.name` で置き換える */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? DICTS.ja_jp[key] ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}

/** 画面を言語の切り替えに追従させるための context */
export const LangContext = createContext<Lang>('ja_jp')

/** 画面部品用の `t`。言語が変わると呼び出し元が再描画される */
export function useT() {
  useContext(LangContext)
  return t
}

/** 表示中の言語（Canvas など、言語が変わったら描き直したい処理の依存に使う） */
export const useLang = () => useContext(LangContext)
