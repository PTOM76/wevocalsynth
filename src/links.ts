// 外部へのリンク。移転したら（ユーザーガイドを DokuWiki に移すなど）ここだけを変える

export const REPOSITORY_URL = 'https://github.com/PTOM76/wevocalsynth'

/** ユーザーガイド（ヘルプ → ユーザーガイド） */
export const USER_GUIDE_URL = 'https://github.com/PTOM76/wevocalsynth/blob/main/docs/MANUAL.md'

/** リンクをブラウザの新しいタブで開く（アプリの画面はそのまま残す） */
export const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
