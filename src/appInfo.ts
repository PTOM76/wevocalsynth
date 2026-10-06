// アプリの定義。vite.config.ts からも読み込むので、ほかのファイルを import しない（使い方は appConfig.ts の app）
export const APP_INFO = {
  id: 'wevocalsynth',
  name: 'WeVocalSynth',
  author: 'PitaQ',
  repository: 'https://github.com/PTOM76/wevocalsynth',
  // ユーザーガイド（ヘルプ → ユーザーガイド）。DokuWiki に移すなど、移転したらここだけを変える
  guide: 'https://github.com/PTOM76/wevocalsynth/blob/main/docs/MANUAL.md',
  site: 'https://wevocalsynth.pitan76.net/',
  lang: 'ja_jp',
}
