import { classifySingleBookmark } from '../lib/classifier'
import { getAllFolders, getOrCreateFolder } from '../lib/bookmarks'
import { DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'

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
  if (!tab?.url?.startsWith('http')) {
    console.warn('[SmartBookmark] 当前页面不是 http(s)，已跳过:', tab?.url)
    return
  }
  console.log('[SmartBookmark] 当前页面:', { title: tab.title, url: tab.url })

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
  } catch (err) {
    console.error('[SmartBookmark] 快捷键收藏失败:', err)
  }
})
