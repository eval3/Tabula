import en, { type Messages } from './locales/en'
import zh_CN from './locales/zh_CN'
import zh_TW from './locales/zh_TW'

type MessageKey = keyof Messages

function detectLocale(): string {
  try {
    const lang = chrome.i18n.getUILanguage().toLowerCase()
    if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant') || lang.startsWith('zh-hk') || lang === 'zh_tw') return 'zh_TW'
    if (lang.startsWith('zh')) return 'zh_CN'
  } catch {
    // fallback to en
  }
  return 'en'
}

const LOCALES: Record<string, Messages> = { en, zh_CN, zh_TW }
const messages: Messages = LOCALES[detectLocale()] ?? en

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let msg: string = messages[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return msg
}
