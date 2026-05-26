export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
  dateAdded?: number
}

const SYSTEM_IDS = new Set(['0', '1', '2', '3'])
const SYSTEM_TITLES = new Set(['书签栏', '其他书签', '移动设备书签', 'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks'])

function isSystemNode(node: BookmarkNode): boolean {
  return SYSTEM_IDS.has(node.id) || SYSTEM_TITLES.has(node.title)
}

export function getDisplayRoots(tree: BookmarkNode[]): BookmarkNode[] {
  const roots: BookmarkNode[] = []
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (isSystemNode(node)) {
        if (node.children) traverse(node.children)
      } else if (!node.url) {
        roots.push(node)
      }
    }
  }
  traverse(tree)
  return roots
}

export function getAllFolderIds(nodes: BookmarkNode[]): string[] {
  const ids: string[] = []
  function traverse(node: BookmarkNode) {
    if (!node.url) {
      ids.push(node.id)
      node.children?.forEach(traverse)
    }
  }
  nodes.forEach(traverse)
  return ids
}

export function searchBookmarks(query: string, tree: BookmarkNode[]): BookmarkNode[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const results: BookmarkNode[] = []
  function traverse(node: BookmarkNode) {
    if (node.url) {
      if (node.title.toLowerCase().includes(q) || node.url.toLowerCase().includes(q)) {
        results.push(node)
      }
    }
    node.children?.forEach(traverse)
  }
  tree.forEach(traverse)
  return results
}

export function findNodeById(id: string, tree: BookmarkNode[]): BookmarkNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(id, node.children)
      if (found) return found
    }
  }
  return null
}

export function getRecentBookmarks(tree: BookmarkNode[], months = 1): BookmarkNode[] {
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000
  const bookmarks: BookmarkNode[] = []
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url && (node.dateAdded == null || node.dateAdded >= cutoff)) {
        bookmarks.push(node)
      }
      if (node.children) traverse(node.children)
    }
  }
  traverse(tree)
  bookmarks.sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
  return bookmarks
}

export function getAllBookmarksInFolder(node: BookmarkNode): BookmarkNode[] {
  const bookmarks: BookmarkNode[] = []
  function traverse(n: BookmarkNode) {
    if (n.url) bookmarks.push(n)
    n.children?.forEach(traverse)
  }
  traverse(node)
  return bookmarks
}

export function getBookmarkPath(bookmarkId: string, tree: BookmarkNode[]): string | undefined {
  function walk(nodes: BookmarkNode[], path: string[]): string | undefined {
    for (const node of nodes) {
      if (isSystemNode(node)) {
        if (node.children) {
          const found = walk(node.children, path)
          if (found) return found
        }
      } else if (!node.url) {
        const nextPath = [...path, node.title]
        if (node.children) {
          for (const child of node.children) {
            if (child.id === bookmarkId) return nextPath.join('/')
          }
          const found = walk(node.children, nextPath)
          if (found) return found
        }
      }
    }
    return undefined
  }
  return walk(tree, [])
}

export async function getRecentlyUsedBookmarks(
  tree: BookmarkNode[],
  limit = 20,
  months = 1
): Promise<BookmarkNode[]> {
  const urlMap = new Map<string, BookmarkNode>()
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url) urlMap.set(node.url, node)
      if (node.children) traverse(node.children)
    }
  }
  traverse(tree)
  if (urlMap.size === 0) return []

  const historyItems = await chrome.history.search({
    text: '',
    maxResults: 1000,
    startTime: Date.now() - months * 30 * 24 * 60 * 60 * 1000,
  })

  const seen = new Set<string>()
  const result: BookmarkNode[] = []
  for (const item of historyItems) {
    if (!item.url) continue
    const node = urlMap.get(item.url)
    if (node && !seen.has(node.id)) {
      seen.add(node.id)
      result.push(node)
      if (result.length >= limit) break
    }
  }
  return result
}

export function getAllFolders(tree: BookmarkNode[]): BookmarkNode[] {
  const folders: BookmarkNode[] = []
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (isSystemNode(node)) {
        if (node.children) traverse(node.children)
      } else if (!node.url) {
        folders.push(node)
        if (node.children) traverse(node.children)
      }
    }
  }
  traverse(tree)
  return folders
}
