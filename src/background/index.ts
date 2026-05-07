import { classifySingleBookmark } from '../lib/classifier'
import { getAllFolders, getOrCreateFolder } from '../lib/bookmarks'
import { DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { t } from '../lib/i18n'

interface ActiveConfig {
  providerId: ProviderId
  apiKey: string
  model: string
}

async function getActiveConfig(): Promise<ActiveConfig | null> {
  const result = await chrome.storage.sync.get(['activeProvider', 'activeModel', 'apiKeys'])
  const providerId: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
  const apiKeys = (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {}
  const apiKey = apiKeys[providerId] ?? ''
  const model = (result.activeModel as string) ?? ''
  if (!apiKey || !model) return null
  return { providerId, apiKey, model }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let spinnerTimer: ReturnType<typeof setInterval> | null = null

function startSpinner() {
  let frame = 0
  chrome.action.setBadgeBackgroundColor({ color: [79, 70, 229, 255] })
  chrome.action.setBadgeText({ text: SPINNER_FRAMES[0] })
  spinnerTimer = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length
    chrome.action.setBadgeText({ text: SPINNER_FRAMES[frame] })
  }, 100)
}

function stopSpinner() {
  if (spinnerTimer !== null) {
    clearInterval(spinnerTimer)
    spinnerTimer = null
  }
}

function setBadge(text: string, color: [number, number, number, number]) {
  stopSpinner()
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

function clearBadgeAfter(ms: number) {
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), ms)
}

const TOAST_ID = '__smart_bookmark_toast__'
const TOAST_STYLE_ID = '__smart_bookmark_style__'

async function showLoadingToast(tabId: number, message: string) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg: string, toastId: string, styleId: string) => {
        document.getElementById(toastId)?.remove()

        if (!document.getElementById(styleId)) {
          const style = document.createElement('style')
          style.id = styleId
          style.textContent = `
            @keyframes __sb_spin__ { to { transform: rotate(360deg); } }
            @keyframes __sb_in__ { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          `
          document.head.appendChild(style)
        }

        const toast = document.createElement('div')
        toast.id = toastId
        toast.style.cssText = `
          position:fixed; bottom:28px; right:28px;
          display:flex; align-items:center; gap:10px;
          max-width:320px; background:#1e1b4b; color:#fff;
          padding:12px 16px; border-radius:10px; font-size:14px; line-height:1.4;
          z-index:2147483647; box-shadow:0 4px 16px rgba(0,0,0,0.25);
          animation:__sb_in__ 0.2s ease forwards;
          font-family:-apple-system,BlinkMacSystemFont,sans-serif;
        `

        const spinner = document.createElement('div')
        spinner.style.cssText = `
          width:14px; height:14px; flex-shrink:0; border-radius:50%;
          border:2px solid rgba(255,255,255,0.3); border-top-color:#fff;
          animation:__sb_spin__ 0.7s linear infinite;
        `

        const text = document.createElement('span')
        text.textContent = msg

        toast.appendChild(spinner)
        toast.appendChild(text)
        document.body.appendChild(toast)
      },
      args: [message, TOAST_ID, TOAST_STYLE_ID],
    })
  } catch (err) {
    console.warn('[SmartBookmark] Toast 注入失败:', err)
  }
}

async function updateToast(tabId: number, message: string, type: 'success' | 'error') {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg: string, t: 'success' | 'error', toastId: string, styleId: string) => {
        const bg = t === 'success' ? '#166534' : '#991b1b'
        const label = (t === 'success' ? '✓  ' : '✗  ') + msg

        const existing = document.getElementById(toastId)
        if (existing) {
          existing.style.background = bg
          existing.style.transition = 'background 0.2s ease'
          existing.innerHTML = ''
          existing.textContent = label
        } else {
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style')
            style.id = styleId
            style.textContent = `@keyframes __sb_in__ { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`
            document.head.appendChild(style)
          }
          const toast = document.createElement('div')
          toast.id = toastId
          toast.style.cssText = `
            position:fixed; bottom:28px; right:28px;
            max-width:320px; background:${bg}; color:#fff;
            padding:12px 16px; border-radius:10px; font-size:14px; line-height:1.4;
            z-index:2147483647; box-shadow:0 4px 16px rgba(0,0,0,0.25);
            animation:__sb_in__ 0.2s ease forwards;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
          `
          toast.textContent = label
          document.body.appendChild(toast)
        }

        const el = document.getElementById(toastId)!
        setTimeout(() => {
          el.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
          el.style.opacity = '0'
          el.style.transform = 'translateY(8px)'
          setTimeout(() => el.remove(), 200)
        }, 3000)
      },
      args: [message, type, TOAST_ID, TOAST_STYLE_ID],
    })
  } catch (err) {
    console.warn('[SmartBookmark] Toast 更新失败:', err)
  }
}

// 快捷键：收藏当前页面并分类
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'classify-and-bookmark') return
  console.log('[SmartBookmark] 快捷键触发:', command)

  const config = await getActiveConfig()
  if (!config) {
    console.warn('[SmartBookmark] 未配置 API Key 或模型，跳转设置页')
    chrome.runtime.openOptionsPage()
    return
  }
  console.log('[SmartBookmark] 当前配置:', { provider: config.providerId, model: config.model })

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab?.url?.startsWith('http')) {
    console.warn('[SmartBookmark] 当前页面不是 http(s)，已跳过:', tab?.url)
    return
  }
  console.log('[SmartBookmark] 当前页面:', { title: tab.title, url: tab.url })

  startSpinner()
  await showLoadingToast(tab.id, t('toastClassifying'))

  try {
    const folders = await getAllFolders()
    const folderPaths = Object.keys(folders)
    console.log('[SmartBookmark] 现有文件夹数量:', folderPaths.length, folderPaths)

    const targetPath = await classifySingleBookmark(config, tab.title ?? tab.url, tab.url, folderPaths)
    console.log('[SmartBookmark] AI 分类结果:', `"${targetPath}"`)

    const folderId = await getOrCreateFolder(targetPath)
    console.log('[SmartBookmark] 目标文件夹 ID:', folderId)

    await chrome.bookmarks.create({ parentId: folderId, title: tab.title ?? tab.url, url: tab.url })
    console.log(`[SmartBookmark] 收藏成功 →「${targetPath}」`)

    setBadge('✓', [22, 163, 74, 255])
    clearBadgeAfter(3000)
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await updateToast(activeTab?.id ?? tab.id, t('toastSaved', { folder: targetPath }), 'success')
  } catch (err) {
    console.error('[SmartBookmark] 快捷键收藏失败:', err)
    setBadge('✗', [220, 38, 38, 255])
    clearBadgeAfter(3000)
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const msg = err instanceof Error ? err.message : String(err)
    await updateToast(activeTab?.id ?? tab.id, t('toastSaveFailed', { error: msg }), 'error')
  }
})
