import { formatBuild } from 'pevenmui/pwa'

// 新しい版の通知と確認は PevenMUI（pevenmui/pwa）が受け持つ

/** 今動いている版（バージョンとコミット。例: 1.0.3 (47a7e39)） */
export const APP_BUILD = formatBuild(__APP_VERSION__, __APP_COMMIT__)
