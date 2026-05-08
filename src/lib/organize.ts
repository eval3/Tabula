import { getAllBookmarks, getAllFolders, getOrCreateFolder, moveBookmark } from './bookmarks'
import { classifyBookmarks } from './classifier'
import type { BookmarkItem } from './classifier'
import { DEFAULT_PROVIDER, type ProviderId } from './providers'

export interface OrganizeProgress { done: number; total: number }
export type OrganizeStatus = 'idle' | 'loading' | 'success' | 'error' | 'no-key'

export interface PreviewItem {
  bookmarkId: string
  title: string
  targetFolder: string
}

export interface OrganizePrefs {
  granularity: 'coarse' | 'medium' | 'fine'
  namingLang: 'zh' | 'en' | 'auto'
  allowNewFolders: boolean
  classifyBy: 'topic' | 'scenario' | 'type' | 'platform'
  customInstructions: string
}

export const DEFAULT_PREFS: OrganizePrefs = {
  granularity: 'medium',
  namingLang: 'zh',
  allowNewFolders: true,
  classifyBy: 'topic',
  customInstructions: '',
}

async function resolveConfig(): Promise<
  | { status: 'no-key' }
  | { status: 'ok'; config: { providerId: ProviderId; apiKey: string; model: string } }
> {
  const result = await chrome.storage.sync.get(['activeProvider', 'activeModel', 'apiKeys'])
  const providerId: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
  const apiKeys = (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {}
  const apiKey = apiKeys[providerId] ?? ''
  const model = (result.activeModel as string) ?? ''
  if (!apiKey || !model) return { status: 'no-key' }
  return { status: 'ok', config: { providerId, apiKey, model } }
}

export async function previewOrganize(
  onProgress: (p: OrganizeProgress) => void,
  prefs: OrganizePrefs = DEFAULT_PREFS
): Promise<{ status: Exclude<OrganizeStatus, 'idle' | 'loading'>; items?: PreviewItem[]; error?: string }> {
  const configResult = await resolveConfig()
  if (configResult.status === 'no-key') return { status: 'no-key' }
  const { config } = configResult

  try {
    const rawBookmarks = await getAllBookmarks()
    const folders = await getAllFolders()
    const folderNames = Object.keys(folders)
    const bookmarkItems: BookmarkItem[] = rawBookmarks.map(b => ({
      id: b.id,
      title: b.title ?? '',
      url: b.url ?? '',
    }))

    let done = 0
    onProgress({ done, total: bookmarkItems.length })

    const batchSize = 20
    const concurrency = 3
    const batches: BookmarkItem[][] = []
    for (let i = 0; i < bookmarkItems.length; i += batchSize) {
      batches.push(bookmarkItems.slice(i, i + batchSize))
    }

    const allItems: PreviewItem[] = []
    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency)
      const chunkResults = await Promise.all(
        chunk.map(batch => classifyBookmarks(config, batch, folderNames, prefs))
      )
      for (const results of chunkResults) {
        for (const r of results) {
          const bm = bookmarkItems.find(b => b.id === r.bookmarkId)
          allItems.push({ bookmarkId: r.bookmarkId, title: bm?.title ?? '', targetFolder: r.folderName })
          done++
          onProgress({ done, total: bookmarkItems.length })
        }
      }
    }
    return { status: 'success', items: allItems }
  } catch (err) {
    console.error('[SmartBookmark] previewOrganize failed:', err)
    return { status: 'error', error: err instanceof Error ? err.message : '未知错误' }
  }
}

export async function applyOrganize(
  items: PreviewItem[],
  onProgress: (p: OrganizeProgress) => void
): Promise<{ status: Exclude<OrganizeStatus, 'idle' | 'loading'>; error?: string }> {
  try {
    let done = 0
    onProgress({ done, total: items.length })
    for (const item of items) {
      const folderId = await getOrCreateFolder(item.targetFolder)
      await moveBookmark(item.bookmarkId, folderId)
      done++
      onProgress({ done, total: items.length })
    }
    return { status: 'success' }
  } catch (err) {
    console.error('[SmartBookmark] applyOrganize failed:', err)
    return { status: 'error', error: err instanceof Error ? err.message : '未知错误' }
  }
}
