import { classifySingleBookmark } from '../lib/classifier'
import { getAllFolders, getOrCreateFolder, moveBookmark } from '../lib/bookmarks'
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

async function classifyAndMove(config: ActiveConfig, bookmarkId: string, title: string, url: string) {
  const folders = await getAllFolders()
  const folderPaths = Object.keys(folders)
  const targetPath = await classifySingleBookmark(config, title, url, folderPaths)
  const folderId = await getOrCreateFolder(targetPath)
  await moveBookmark(bookmarkId, folderId)
}

// 新增书签时自动分类
chrome.bookmarks.onCreated.addListener(async (_id, bookmark) => {
  if (!bookmark.url) return

  const result = await chrome.storage.sync.get('autoClassify')
  if (result.autoClassify === false) return

  const config = await getActiveConfig()
  if (!config) return

  try {
    await classifyAndMove(config, bookmark.id, bookmark.title ?? '', bookmark.url)
  } catch (err) {
    console.error('[SmartBookmark] 自动分类失败:', err)
  }
})

// 快捷键：收藏当前页面并分类
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'classify-and-bookmark') return

  const config = await getActiveConfig()
  if (!config) {
    chrome.runtime.openOptionsPage()
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url?.startsWith('http')) return

  try {
    const folders = await getAllFolders()
    const folderPaths = Object.keys(folders)
    const targetPath = await classifySingleBookmark(config, tab.title ?? tab.url, tab.url, folderPaths)
    const folderId = await getOrCreateFolder(targetPath)
    await chrome.bookmarks.create({ parentId: folderId, title: tab.title ?? tab.url, url: tab.url })
    console.log(`[SmartBookmark] 已收藏到「${targetPath}」`)
  } catch (err) {
    console.error('[SmartBookmark] 快捷键收藏失败:', err)
  }
})
