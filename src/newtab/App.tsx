import { useState, useEffect, useMemo } from 'react'
import BookmarkCard from './components/BookmarkCard'
import OrganizeFAB from './components/OrganizeFAB'
import {
  getDisplayRoots, searchBookmarks, findNodeById,
  getRecentBookmarks, getAllBookmarksInFolder, getAllFolders, getBookmarkPath,
  type BookmarkNode,
} from './utils'
import { organizeAllBookmarks, type OrganizeStatus, type OrganizeProgress } from '../lib/organize'

export default function App() {
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [organizeStatus, setOrganizeStatus] = useState<OrganizeStatus>('idle')
  const [organizeProgress, setOrganizeProgress] = useState<OrganizeProgress>({ done: 0, total: 0 })
  const [showFullPath, setShowFullPath] = useState(false)

  async function loadTree() {
    const tree = await chrome.bookmarks.getTree()
    setBookmarkTree(tree as unknown as BookmarkNode[])
  }

  useEffect(() => { loadTree() }, [])

  const displayRoots = useMemo(() => getDisplayRoots(bookmarkTree), [bookmarkTree])

  const displayedBookmarks = useMemo(() => {
    if (searchQuery.trim()) return searchBookmarks(searchQuery, bookmarkTree)
    if (selectedFolderId) {
      const folder = findNodeById(selectedFolderId, bookmarkTree)
      return folder ? getAllBookmarksInFolder(folder) : []
    }
    return getRecentBookmarks(bookmarkTree, 50)
  }, [searchQuery, bookmarkTree, selectedFolderId])

  const sectionTitle = useMemo(() => {
    if (searchQuery.trim()) return `搜索"${searchQuery}"`
    if (selectedFolderId) {
      const folder = findNodeById(selectedFolderId, bookmarkTree)
      return folder?.title ?? '书签'
    }
    return '最近添加'
  }, [searchQuery, selectedFolderId, bookmarkTree])

  const folderOptions = useMemo(() => getAllFolders(bookmarkTree), [bookmarkTree])

  const bookmarksWithFolder = useMemo(() =>
    displayedBookmarks.map(b => ({
      ...b,
      folderName: showFullPath
        ? getBookmarkPath(b.id, bookmarkTree)
        : findFolderName(b.id, bookmarkTree),
    })),
    [displayedBookmarks, bookmarkTree, showFullPath]
  )

  async function handleOrganize() {
    setOrganizeStatus('loading')
    setOrganizeProgress({ done: 0, total: 0 })
    const result = await organizeAllBookmarks((p) => setOrganizeProgress(p))
    setOrganizeStatus(result.status)
    if (result.status === 'success') await loadTree()
  }

  return (
    <div className="app">
      <div className="app-header">
        <span className="app-logo">🔖</span>
        <h1 className="app-title">Smart Bookmark</h1>
      </div>

      <div className="search-wrapper">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索书签…"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              if (e.target.value.trim()) setSelectedFolderId(null)
            }}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      </div>

      <div className="pills-row">
        <button
          className={`pill${selectedFolderId === null && !searchQuery.trim() ? ' active' : ''}`}
          onClick={() => { setSelectedFolderId(null); setSearchQuery('') }}
        >
          最近
        </button>
        {displayRoots.map(f => (
          <button
            key={f.id}
            className={`pill${selectedFolderId === f.id ? ' active' : ''}`}
            onClick={() => { setSelectedFolderId(f.id); setSearchQuery('') }}
          >
            {f.title}
          </button>
        ))}
      </div>

      <div className="section-header">
        <h2 className="section-title">{sectionTitle}</h2>
        <label className="path-toggle">
          <input
            type="checkbox"
            checked={showFullPath}
            onChange={e => setShowFullPath(e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">完整路径</span>
        </label>
        <span className="section-count">{bookmarksWithFolder.length} 个书签</span>
      </div>

      <div className="card-grid">
        {bookmarksWithFolder.length === 0 ? (
          <div className="empty-state">
            {searchQuery.trim() ? '没有匹配的书签' : '暂无书签'}
          </div>
        ) : (
          bookmarksWithFolder.map(b => (
            <BookmarkCard key={b.id} bookmark={b} folders={folderOptions} onUpdated={loadTree} />
          ))
        )}
      </div>

      <OrganizeFAB
        status={organizeStatus}
        progress={organizeProgress}
        onOrganize={handleOrganize}
      />
    </div>
  )
}

function findFolderName(bookmarkId: string, tree: BookmarkNode[]): string | undefined {
  function walk(nodes: BookmarkNode[], parentTitle?: string): string | undefined {
    for (const node of nodes) {
      if (node.children) {
        for (const child of node.children) {
          if (child.id === bookmarkId) return node.title || parentTitle
          if (!child.url) {
            const found = walk([child], child.title || parentTitle)
            if (found) return found
          }
        }
      }
    }
    return undefined
  }
  return walk(tree)
}
