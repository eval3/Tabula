import { getAllBookmarks, getAllFolders, getOrCreateFolder, moveBookmark } from './bookmarks'
import { classifyBookmarks } from './classifier'
import type { BookmarkItem } from './classifier'
import { DEFAULT_PROVIDER, type ProviderId } from './providers'

export interface OrganizeProgress { done: number; total: number }
export type OrganizeStatus = 'idle' | 'loading' | 'success' | 'error' | 'no-key'

export async function organizeAllBookmarks(
  onProgress: (p: OrganizeProgress) => void
): Promise<{ status: Exclude<OrganizeStatus, 'idle' | 'loading'>; error?: string }> {
  const result = await chrome.storage.sync.get(['activeProvider', 'activeModel', 'apiKeys'])
  const providerId: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
  const apiKeys = (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {}
  const apiKey = apiKeys[providerId] ?? ''
  const model = (result.activeModel as string) ?? ''

  if (!apiKey || !model) return { status: 'no-key' }

  const config = { providerId, apiKey, model }

  try {
    const rawBookmarks = await getAllBookmarks()
    const folders = await getAllFolders()
    const folderNames = Object.keys(folders)
    const uncategorized: BookmarkItem[] = rawBookmarks.map(b => ({
      id: b.id,
      title: b.title ?? '',
      url: b.url ?? '',
    }))

    let done = 0
    onProgress({ done, total: uncategorized.length })

    const batchSize = 20
    const concurrency = 3
    const batches: BookmarkItem[][] = []
    for (let i = 0; i < uncategorized.length; i += batchSize) {
      batches.push(uncategorized.slice(i, i + batchSize))
    }

    for (let i = 0; i < batches.length; i += concurrency) {
      const chunk = batches.slice(i, i + concurrency)
      const chunkResults = await Promise.all(
        chunk.map(batch => classifyBookmarks(config, batch, folderNames))
      )
      for (const results of chunkResults) {
        for (const r of results) {
          const folderId = await getOrCreateFolder(r.folderName)
          await moveBookmark(r.bookmarkId, folderId)
          done++
          onProgress({ done, total: uncategorized.length })
        }
      }
    }
    return { status: 'success' }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : '未知错误' }
  }
}
