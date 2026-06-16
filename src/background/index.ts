import { classifySingleBookmark, type PageContext } from '../lib/classifier'
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

const TOAST_ID = '__tabula_toast__'
const TOAST_STYLE_ID = '__tabula_style__'

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
    console.warn('[Tabula] Toast 注入失败:', err)
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
    console.warn('[Tabula] Toast 更新失败:', err)
  }
}

// 右键菜单：在与书签文件夹同名的标签分组内打开
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-bookmark-in-group',
    title: '在分组内打开',
    contexts: ['page'],
    documentUrlPatterns: [chrome.runtime.getURL('src/newtab/index.html')],
  })
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'open-bookmark-in-group') return
  const data = await chrome.storage.session.get(['ctxBookmarkUrl', 'ctxBookmarkFolder'])
  const url = data.ctxBookmarkUrl as string | undefined
  const folderName = data.ctxBookmarkFolder as string | undefined
  if (!url) return

  const tab = await chrome.tabs.create({ url })
  if (!tab.id || !folderName) return

  const groups = await chrome.tabGroups.query({})
  const match = groups.find(g => g.title === folderName)
  if (match) {
    await chrome.tabs.group({ tabIds: [tab.id], groupId: match.id })
  } else {
    const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] })
    await chrome.tabGroups.update(newGroupId, { title: folderName })
  }
})

// 整理分类进度 badge
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'organize:start') {
    startSpinner()
  } else if (msg?.type === 'organize:stop') {
    if (msg.status === 'success') {
      setBadge('✓', [22, 163, 74, 255])
      clearBadgeAfter(3000)
    } else if (msg.status === 'error') {
      setBadge('✗', [220, 38, 38, 255])
      clearBadgeAfter(3000)
    } else {
      stopSpinner()
      chrome.action.setBadgeText({ text: '' })
    }
  } else if (msg?.type === 'classify-and-bookmark') {
    void classifyAndBookmarkActiveTab()
  }
})

// 从当前页面抓取元数据与正文摘要，帮助 AI 理解书签内容
async function extractPageContext(tabId: number): Promise<PageContext | undefined> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel: string) =>
          (document.querySelector(sel)?.getAttribute('content') ?? '').trim()
        const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
        return {
          siteName: meta('meta[property="og:site_name"]'),
          ogType: meta('meta[property="og:type"]'),
          description:
            meta('meta[name="description"]') || meta('meta[property="og:description"]'),
          keywords: meta('meta[name="keywords"]'),
          heading: clean(document.querySelector('h1')?.textContent ?? '').slice(0, 120),
          excerpt: clean(document.body?.innerText ?? '').slice(0, 300),
        }
      },
    })
    return injection?.result as PageContext | undefined
  } catch (err) {
    console.warn('[Tabula] 抓取页面信息失败，将仅用标题和 URL 分类:', err)
    return undefined
  }
}

// 收藏当前活动标签页并智能分类（快捷键与 popup 按钮共用）
async function classifyAndBookmarkActiveTab(): Promise<void> {
  const config = await getActiveConfig()
  if (!config) {
    console.warn('[Tabula] 未配置 API Key 或模型，跳转设置页')
    chrome.runtime.openOptionsPage()
    return
  }
  console.log('[Tabula] 当前配置:', { provider: config.providerId, model: config.model })

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab?.url?.startsWith('http')) {
    console.warn('[Tabula] 当前页面不是 http(s)，已跳过:', tab?.url)
    return
  }
  console.log('[Tabula] 当前页面:', { title: tab.title, url: tab.url })

  startSpinner()
  await showLoadingToast(tab.id, t('toastClassifying'))

  try {
    const folders = await getAllFolders()
    const folderPaths = Object.keys(folders)
    console.log('[Tabula] 现有文件夹数量:', folderPaths.length, folderPaths)

    const pageContext = await extractPageContext(tab.id)
    console.log('[Tabula] 页面信息:', pageContext)

    const { title: smartTitle, path: targetPath } = await classifySingleBookmark(config, tab.title ?? tab.url, tab.url, folderPaths, pageContext)
    console.log('[Tabula] AI 分类结果:', { title: smartTitle, path: targetPath })

    const folderId = await getOrCreateFolder(targetPath)
    console.log('[Tabula] 目标文件夹 ID:', folderId)

    const bookmarkTitle = smartTitle || tab.title || tab.url
    await chrome.bookmarks.create({ parentId: folderId, title: bookmarkTitle, url: tab.url, index: 0 })
    console.log(`[Tabula] 收藏成功 →「${targetPath}/${bookmarkTitle}」`)

    setBadge('✓', [22, 163, 74, 255])
    clearBadgeAfter(3000)
    // 始终更新发起收藏的那个 tab，否则用户切走后原 tab 的 loading 会一直残留
    await updateToast(tab.id, t('toastSaved', { folder: targetPath }), 'success')
  } catch (err) {
    console.error('[Tabula] 收藏失败:', err)
    setBadge('✗', [220, 38, 38, 255])
    clearBadgeAfter(3000)
    const msg = err instanceof Error ? err.message : String(err)
    await updateToast(tab.id, t('toastSaveFailed', { error: msg }), 'error')
  }
}

// 快捷键触发收藏
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'classify-and-bookmark') return
  console.log('[Tabula] 快捷键触发:', command)
  void classifyAndBookmarkActiveTab()
})
