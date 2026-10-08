// ヘルプのコマンド（ユーザーガイド、ショートカット、更新の確認など）
import { checkForUpdate, promptUpdate } from 'pevenmui/pwa'
import { i18n, resolveLang } from '../i18n/i18n'
import { openExternal, USER_GUIDE_URL } from '../links'
import { defineCommands } from './types'

export const helpCommands = defineCommands({
  userGuide: { label: 'menu.userGuide', run: () => openExternal(USER_GUIDE_URL) },
  shortcuts: { label: 'menu.shortcuts', run: (c) => c.dialogs.open('shortcuts') },
  // 新しい版があれば、右下の通知（UpdatePrompt）からそのまま更新できる。ここでは結果だけを知らせる
  checkUpdate: {
    label: 'menu.checkUpdate',
    run: (c) =>
      void checkForUpdate().then((r) => {
        if (r.kind === 'found') return promptUpdate(r.build)
        const l = i18n.labels(resolveLang(c.settings.language))
        const text = { latest: l.updateLatest, unsupported: l.updateUnsupported, failed: l.updateFailed }[r.kind]
        c.ed.setToast({ severity: r.kind === 'failed' ? 'error' : 'info', message: text })
      }),
  },
  licenses: { label: 'menu.licenses', run: (c) => c.dialogs.open('licenses') },
  about: { label: 'menu.about', run: (c) => c.dialogs.open('about') },
})
