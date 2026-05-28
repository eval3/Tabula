export interface FolderMap {
  [path: string]: string  // "前端开发/React/Hooks" -> folderId
}

// Chrome 书签树的系统节点 id，不计入路径
const SYSTEM_IDS = new Set(['0', '1', '2', '3'])

export async function getAllFolders(): Promise<FolderMap> {
  const tree = await chrome.bookmarks.getTree()
  const folders: FolderMap = {}

  function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string) {
    for (const node of nodes) {
      if (node.url) continue
      if (SYSTEM_IDS.has(node.id)) {
        // 系统节点本身不进路径，直接下沉
        if (node.children) traverse(node.children, parentPath)
      } else if (node.title) {
        const path = parentPath ? `${parentPath}/${node.title}` : node.title
        folders[path] = node.id
        if (node.children) traverse(node.children, path)
      }
    }
  }

  traverse(tree, '')
  return folders
}

export async function getAllBookmarks(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const tree = await chrome.bookmarks.getTree()
  const bookmarks: chrome.bookmarks.BookmarkTreeNode[] = []

  function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodes) {
      if (node.url) bookmarks.push(node)
      if (node.children) traverse(node.children)
    }
  }

  traverse(tree)
  return bookmarks
}

// 按路径逐级查找或创建文件夹，返回最终文件夹 id
export async function getOrCreateFolder(folderPath: string): Promise<string> {
  const segments = folderPath.split('/').filter(Boolean)
  if (segments.length === 0) throw new Error('Invalid folder path')

  const folders = await getAllFolders()
  console.log('[Tabula] getOrCreateFolder:', folderPath, '| segments:', segments)

  // 从书签树动态找到书签栏真实 ID，避免硬编码 '1' 失效
  const tree = await chrome.bookmarks.getTree()
  const barNode = tree[0]?.children?.find(n => !n.url)
  const barId = barNode?.id ?? '1'
  console.log('[Tabula] 书签栏根节点 id:', barId, 'title:', barNode?.title)

  let parentId = barId
  let currentPath = ''

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment
    if (folders[currentPath]) {
      parentId = folders[currentPath]
      console.log('[Tabula]   已存在:', currentPath, '→ id:', parentId)
    } else {
      console.log('[Tabula]   创建文件夹:', segment, '在 parentId:', parentId)
      const newFolder = await chrome.bookmarks.create({ parentId, title: segment })
      folders[currentPath] = newFolder.id
      parentId = newFolder.id
      console.log('[Tabula]   创建成功，新 id:', parentId)
    }
  }

  return parentId
}

export async function moveBookmark(bookmarkId: string, folderId: string): Promise<void> {
  await chrome.bookmarks.move(bookmarkId, { parentId: folderId })
}

// ─── Bookmark Snapshots ───────────────────────────────────────────────────────

export interface SerializedNode {
  title: string
  url?: string
  children?: SerializedNode[]
}

export interface BookmarkSnapshot {
  id: string
  timestamp: number
  bookmarkCount: number
  bars: SerializedNode[]   // children of bookmark bar
  other: SerializedNode[]  // children of other bookmarks
}

const SNAPSHOT_KEY = 'bookmarkSnapshots'
const MAX_SNAPSHOTS = 5

function serializeNode(node: chrome.bookmarks.BookmarkTreeNode): SerializedNode {
  const result: SerializedNode = { title: node.title }
  if (node.url) result.url = node.url
  if (node.children?.length) result.children = node.children.map(serializeNode)
  return result
}

function countBookmarks(nodes: SerializedNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.url) count++
    if (n.children) count += countBookmarks(n.children)
  }
  return count
}

async function createFromNodes(nodes: SerializedNode[], parentId: string): Promise<void> {
  for (const node of nodes) {
    if (node.url) {
      await chrome.bookmarks.create({ parentId, title: node.title, url: node.url })
    } else {
      const folder = await chrome.bookmarks.create({ parentId, title: node.title })
      if (node.children?.length) {
        await createFromNodes(node.children, folder.id)
      }
    }
  }
}

async function clearNodeChildren(nodeId: string): Promise<void> {
  const children = await chrome.bookmarks.getChildren(nodeId)
  for (const child of children) {
    if (child.url) {
      await chrome.bookmarks.remove(child.id)
    } else {
      await chrome.bookmarks.removeTree(child.id)
    }
  }
}

export async function getBookmarkSnapshots(): Promise<BookmarkSnapshot[]> {
  const result = await chrome.storage.local.get(SNAPSHOT_KEY)
  return (result[SNAPSHOT_KEY] as BookmarkSnapshot[]) ?? []
}

export async function saveBookmarkSnapshot(): Promise<BookmarkSnapshot> {
  const tree = await chrome.bookmarks.getTree()
  const root = tree[0]

  const barNode = root.children?.find(n => !n.url && n.id !== '3')
  const otherNode = root.children?.find(n => n.id === '2') ?? root.children?.find(n => !n.url && n !== barNode)

  const bars = barNode?.children?.map(serializeNode) ?? []
  const other = otherNode?.children?.map(serializeNode) ?? []

  const snapshot: BookmarkSnapshot = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    bookmarkCount: countBookmarks(bars) + countBookmarks(other),
    bars,
    other,
  }

  const existing = await getBookmarkSnapshots()
  const updated = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS)
  await chrome.storage.local.set({ [SNAPSHOT_KEY]: updated })
  return snapshot
}

export async function deleteBookmarkSnapshot(id: string): Promise<void> {
  const existing = await getBookmarkSnapshots()
  await chrome.storage.local.set({ [SNAPSHOT_KEY]: existing.filter(s => s.id !== id) })
}

export async function restoreBookmarkSnapshot(snapshot: BookmarkSnapshot): Promise<void> {
  const tree = await chrome.bookmarks.getTree()
  const root = tree[0]

  const barNode = root.children?.find(n => !n.url && n.id !== '3')
  const otherNode = root.children?.find(n => n.id === '2') ?? root.children?.find(n => !n.url && n !== barNode)

  if (barNode) {
    await clearNodeChildren(barNode.id)
    await createFromNodes(snapshot.bars, barNode.id)
  }

  if (otherNode && snapshot.other.length > 0) {
    await clearNodeChildren(otherNode.id)
    await createFromNodes(snapshot.other, otherNode.id)
  }
}
