// ウィンドウごとの枠（PevenMUI。WeVocal Studio と共通）。名前の頭はこのアプリのもの
import { configureWindowSlots } from 'pevenmui/web'
import { app } from '../appConfig'

configureWindowSlots(app.key(''))
export { slot, acquireSlot, otherWindowsOpen, openWindowCount, slotTag, slotKey, openNewWindow } from 'pevenmui/web'
