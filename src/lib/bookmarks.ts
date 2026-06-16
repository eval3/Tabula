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
