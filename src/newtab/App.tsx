import { useState, useEffect, useMemo } from 'react'
import FolderTree from './components/FolderTree'
import BookmarkList from './components/BookmarkList'
import {
  getDisplayRoots, getAllFolderIds, searchBookmarks, findNodeById,
  type BookmarkNode,
} from './utils'
import { organizeAllBookmarks, type OrganizeStatus, type OrganizeProgress } from '../lib/organize'

export default function App() {
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dragBookmarkId, setDragBookmarkId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [organizeStatus, setOrganizeStatus] = useState<OrganizeStatus>('idle')
  const [organizeProgress, setOrganizeProgress] = useState<OrganizeProgress>({ done: 0, total: 0 })

  async function loadTree() {
    const tree = await chrome.bookmarks.getTree()
    setBookmarkTree(tree as unknown as BookmarkNode[])
  }

  useEffect(() => { loadTree() }, [])

  const displayRoots = useMemo(() => getDisplayRoots(bookmarkTree), [bookmarkTree])

  const currentFolder = useMemo(
    () => (selectedFolderId ? findNodeById(selectedFolderId, bookmarkTree) : null),
    [selectedFolderId, bookmarkTree]
  )

  const currentBookmarks = useMemo(() => {
    if (searchQuery.trim()) return searchBookmarks(searchQuery, bookmarkTree)
    return currentFolder?.children?.filter(c => !!c.url) ?? []
  }, [searchQuery, bookmarkTree, currentFolder])

  const currentFolderName = searchQuery.trim()
    ? `搜索"${searchQuery}"`
    : (currentFolder?.title ?? '请选择文件夹')

  function handleToggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleDrop(folderId: string) {
    if (!dragBookmarkId || folderId === currentFolder?.id) return
    await chrome.bookmarks.move(dragBookmarkId, { parentId: folderId })
    setDragBookmarkId(null)
    setDragOverFolderId(null)
    await loadTree()
  }

  async function handleOrganize() {
    setOrganizeStatus('loading')
    setOrganizeProgress({ done: 0, total: 0 })
    const result = await organizeAllBookmarks((p) => setOrganizeProgress(p))
    setOrganizeStatus(result.status)
    if (result.status === 'success') await loadTree()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="icon">🔖</div>
          <span className="logo-name">Smart Bookmark</span>
        </div>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索书签标题、网址..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="topbar-right">
          {organizeStatus === 'loading' && (
            <span className="organize-progress">
              整理中 {organizeProgress.done}/{organizeProgress.total}
            </span>
          )}
          {organizeStatus === 'success' && (
            <span className="organize-msg success">整理完成 ✓</span>
          )}
          {organizeStatus === 'error' && (
            <span className="organize-msg error">整理失败</span>
          )}
          {organizeStatus === 'no-key' && (
            <span className="organize-msg no-key">请先配置 API Key</span>
          )}
          <button
            className="organize-btn"
            onClick={handleOrganize}
            disabled={organizeStatus === 'loading'}
          >
            ✨ 一键智能整理
          </button>
        </div>
      </header>

      <div className="body">
        <FolderTree
          folders={displayRoots}
          expandedIds={expandedIds}
          selectedFolderId={selectedFolderId}
          dragOverFolderId={dragOverFolderId}
          onSelectFolder={setSelectedFolderId}
          onToggleExpand={handleToggleExpand}
          onExpandAll={() => setExpandedIds(new Set(getAllFolderIds(displayRoots)))}
          onCollapseAll={() => setExpandedIds(new Set())}
          onDragOver={setDragOverFolderId}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={handleDrop}
        />
        <BookmarkList
          bookmarks={currentBookmarks}
          folderName={currentFolderName}
          onDragStart={setDragBookmarkId}
          onDragEnd={() => setDragBookmarkId(null)}
        />
      </div>
    </div>
  )
}
