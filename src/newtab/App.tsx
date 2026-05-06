import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import BookmarkCard from './components/BookmarkCard'
import OrganizeFAB from './components/OrganizeFAB'
import {
  getDisplayRoots, searchBookmarks, findNodeById,
  getRecentBookmarks, getAllBookmarksInFolder, getAllFolders, getBookmarkPath,
  type BookmarkNode,
} from './utils'
import { organizeAllBookmarks, type OrganizeStatus, type OrganizeProgress } from '../lib/organize'

interface DragState {
  bookmarkId: string
  title: string
  x: number
  y: number
}

export default function App() {
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [organizeStatus, setOrganizeStatus] = useState<OrganizeStatus>('idle')
  const [organizeProgress, setOrganizeProgress] = useState<OrganizeProgress>({ done: 0, total: 0 })
  const [showFullPath, setShowFullPath] = useState(false)
  const [recentMonths, setRecentMonths] = useState(1)
  const [recentOpen, setRecentOpen] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [moveToast, setMoveToast] = useState<string | null>(null)
  const [pillEditMode, setPillEditMode] = useState(false)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<{ id: string; title: string } | null>(null)
  const [pillOrder, setPillOrder] = useState<string[]>([])
  const [pillDraggingId, setPillDraggingId] = useState<string | null>(null)
  const [pillGhost, setPillGhost] = useState<{ title: string; x: number; y: number } | null>(null)
  const [pillDropGapIndex, setPillDropGapIndex] = useState<number | null>(null)
  const [reorderDragId, setReorderDragId] = useState<string | null>(null)
  const [reorderInsertIdx, setReorderInsertIdx] = useState<number | null>(null)
  const [reorderBaseList, setReorderBaseList] = useState<BookmarkNode[] | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dropFolderRef = useRef<{ id: string; title: string } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pillDragIdRef = useRef<string | null>(null)
  const pillGhostRef = useRef<{ title: string; x: number; y: number } | null>(null)
  const pillDropGapRef = useRef<number | null>(null)
  const pillDragOriginalGapRef = useRef<number | null>(null)
  const reorderDragIdRef = useRef<string | null>(null)
  const reorderInsertIdxRef = useRef<number | null>(null)
  const reorderBaseListRef = useRef<BookmarkNode[] | null>(null)
  const reorderParentIdRef = useRef<string | null>(null)
  const capturedRectsRef = useRef<Map<string, DOMRect>>(new Map())

  async function loadTree() {
    const tree = await chrome.bookmarks.getTree()
    setBookmarkTree(tree as unknown as BookmarkNode[])
  }

  useEffect(() => { loadTree() }, [])

  useEffect(() => {
    chrome.storage.local.get('pillOrder', (data) => {
      if (Array.isArray(data.pillOrder)) setPillOrder(data.pillOrder)
    })
  }, [])

  useEffect(() => {
    if (!recentOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRecentOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [recentOpen])

  useEffect(() => {
    if (!pillEditMode) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.pill-wrapper')) setPillEditMode(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pillEditMode])

  // Re-capture card rects after every slot position change so calcReorderInsertIdx
  // always works against current visual positions (not stale pre-shift coords).
  useLayoutEffect(() => {
    if (!reorderDragId) return
    const map = new Map<string, DOMRect>()
    document.querySelectorAll<HTMLElement>('[data-bookmark-id]').forEach(el => {
      map.set(el.dataset.bookmarkId!, el.getBoundingClientRect())
    })
    capturedRectsRef.current = map
  }, [reorderInsertIdx, reorderDragId])

  function startPillLongPress(_id: string) {
    longPressTimer.current = setTimeout(() => setPillEditMode(true), 600)
  }

  function cancelPillLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderTarget) return
    await chrome.bookmarks.removeTree(deleteFolderTarget.id)
    if (selectedFolderId === deleteFolderTarget.id) setSelectedFolderId(null)
    setDeleteFolderTarget(null)
    setPillEditMode(false)
    await loadTree()
  }

  function startPillDragReorder(e: React.MouseEvent, id: string, title: string, currentOrder: { id: string }[]) {
    e.preventDefault()
    pillDragIdRef.current = id
    setPillDraggingId(id)
    // original gap = index of dragged pill in non-dragging array = its index in currentOrder
    pillDragOriginalGapRef.current = currentOrder.findIndex(f => f.id === id)
    const ghost = { title, x: e.clientX, y: e.clientY }
    pillGhostRef.current = ghost
    setPillGhost(ghost)

    function calcGapIndex(clientX: number, clientY: number): number {
      const wrappers = Array.from(
        document.querySelectorAll<HTMLElement>('.pill-wrapper:not(.pill-wrapper--dragging)')
      )
      if (wrappers.length === 0) return 0
      const rects = wrappers.map(el => el.getBoundingClientRect())

      // Find the row whose vertical center is closest to clientY
      const rowCenters = rects.map(r => (r.top + r.bottom) / 2)
      const closestRowY = rowCenters.reduce((best, cy) =>
        Math.abs(cy - clientY) < Math.abs(best - clientY) ? cy : best
      , rowCenters[0])

      // Collect indices of pills on that row
      const rowIndices = wrappers
        .map((_, i) => i)
        .filter(i => Math.abs(rowCenters[i] - closestRowY) < 20)

      // Find gap position within that row by X
      for (const i of rowIndices) {
        if (clientX < rects[i].left + rects[i].width / 2) return i
      }
      return rowIndices[rowIndices.length - 1] + 1
    }

    function onMove(ev: MouseEvent) {
      const updated = { title, x: ev.clientX, y: ev.clientY }
      pillGhostRef.current = updated
      setPillGhost(updated)
      const raw = calcGapIndex(ev.clientX, ev.clientY)
      // suppress gap indicator when at original position
      const gap = raw === pillDragOriginalGapRef.current ? null : raw
      if (gap !== pillDropGapRef.current) {
        pillDropGapRef.current = gap
        setPillDropGapIndex(gap)
      }
    }

    async function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const sourceId = pillDragIdRef.current
      const gapIdx = pillDropGapRef.current
      const originalGap = pillDragOriginalGapRef.current
      pillDragIdRef.current = null
      pillDropGapRef.current = null
      pillDragOriginalGapRef.current = null
      pillGhostRef.current = null
      setPillDraggingId(null)
      setPillGhost(null)
      setPillDropGapIndex(null)
      if (!sourceId || gapIdx === null || gapIdx === originalGap) return
      const withoutSource = currentOrder.filter(f => f.id !== sourceId).map(f => f.id)
      const newIds = [...withoutSource]
      newIds.splice(gapIdx, 0, sourceId)
      setPillOrder(newIds)
      chrome.storage.local.set({ pillOrder: newIds })
      await syncFolderOrderToChrome(newIds.map(id => ({ id })), bookmarkTree)
      await loadTree()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startDrag(bookmarkId: string, title: string, pos: { x: number; y: number }) {
    const initial: DragState = { bookmarkId, title, x: pos.x, y: pos.y }
    dragRef.current = initial
    setDrag(initial)

    // Enable reorder mode in folder view: use the dragged bookmark's actual parent folder
    if (selectedFolderId) {
      const dragParentId = bookmarkParentMap.get(bookmarkId)
      if (dragParentId) {
        // Capture original card rects BEFORE React re-renders (all siblings still in DOM)
        const initRects = new Map<string, DOMRect>()
        document.querySelectorAll<HTMLElement>('[data-bookmark-id]').forEach(el => {
          initRects.set(el.dataset.bookmarkId!, el.getBoundingClientRect())
        })
        capturedRectsRef.current = initRects

        const parentFolder = findNodeById(dragParentId, bookmarkTree)
        const siblings = parentFolder?.children?.filter(c => !!c.url) ?? []
        const origIdx = siblings.findIndex(b => b.id === bookmarkId)
        reorderBaseListRef.current = siblings
        reorderDragIdRef.current = bookmarkId
        reorderParentIdRef.current = dragParentId
        reorderInsertIdxRef.current = origIdx
        setReorderBaseList(siblings)
        setReorderDragId(bookmarkId)
        setReorderInsertIdx(origIdx)
      }
    }

    function calcReorderInsertIdx(clientX: number, clientY: number): number {
      const rectsMap = capturedRectsRef.current
      const baseList = reorderBaseListRef.current
      if (!rectsMap || !baseList) return 0

      // Build ordered non-dragged sibling rects from the latest captured positions
      const nonDragged = baseList
        .filter(b => b.id !== bookmarkId)
        .map(b => rectsMap.get(b.id))
        .filter((r): r is DOMRect => !!r)

      if (nonDragged.length === 0) return 0

      // Direct hit: cursor inside a card rect → left half = before, right half = after
      for (let i = 0; i < nonDragged.length; i++) {
        const r = nonDragged[i]
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return clientX < r.left + r.width / 2 ? i : i + 1
        }
      }

      // Gap between cards: find nearest row then resolve by X
      const rowCenters = nonDragged.map(r => (r.top + r.bottom) / 2)
      const halfH = (nonDragged[0].bottom - nonDragged[0].top) / 2 + 10
      const closestRowY = rowCenters.reduce((best, cy) =>
        Math.abs(cy - clientY) < Math.abs(best - clientY) ? cy : best
      , rowCenters[0])
      const rowIdxs = rowCenters.map((_, i) => i).filter(i => Math.abs(rowCenters[i] - closestRowY) < halfH)
      for (const i of rowIdxs) {
        if (clientX < nonDragged[i].left + nonDragged[i].width / 2) return i
      }
      return (rowIdxs[rowIdxs.length - 1] ?? -1) + 1
    }

    function onMove(e: MouseEvent) {
      const updated = { ...dragRef.current!, x: e.clientX, y: e.clientY }
      dragRef.current = updated
      setDrag(updated)
      if (reorderDragIdRef.current) {
        const newIdx = calcReorderInsertIdx(e.clientX, e.clientY)
        if (newIdx !== reorderInsertIdxRef.current) {
          reorderInsertIdxRef.current = newIdx
          setReorderInsertIdx(newIdx)
        }
      }
    }

    function onUp(_e: MouseEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const id = dragRef.current?.bookmarkId ?? null
      dragRef.current = null
      setDrag(null)
      const target = dropFolderRef.current
      dropFolderRef.current = null
      setDropFolderId(null)

      const drId = reorderDragIdRef.current
      const insertIdx = reorderInsertIdxRef.current
      const origList = reorderBaseListRef.current
      const reorderParentId = reorderParentIdRef.current
      reorderDragIdRef.current = null
      reorderInsertIdxRef.current = null
      reorderBaseListRef.current = null
      reorderParentIdRef.current = null
      setReorderDragId(null)
      setReorderInsertIdx(null)
      setReorderBaseList(null)

      if (id && target) {
        doMove(id, target.id, target.title)
      } else if (drId && origList && insertIdx !== null && reorderParentId) {
        const withoutDrag = origList.filter(b => b.id !== drId)
        const dragged = origList.find(b => b.id === drId)!
        const newOrder = [...withoutDrag]
        newOrder.splice(insertIdx, 0, dragged)
        const origIds = origList.map(b => b.id).join(',')
        const newIds = newOrder.map(b => b.id).join(',')
        if (origIds !== newIds) {
          syncReorderedBookmark(drId, newOrder, reorderParentId).then(() => loadTree())
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function doMove(bookmarkId: string, folderId: string, folderTitle: string) {
    setExitingId(bookmarkId)
    setTimeout(async () => {
      await chrome.bookmarks.move(bookmarkId, { parentId: folderId })
      setExitingId(null)
      await loadTree()
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setMoveToast(`已移入「${folderTitle}」`)
      toastTimer.current = setTimeout(() => setMoveToast(null), 2500)
    }, 250)
  }

  const bookmarkParentMap = useMemo(() => {
    const map = new Map<string, string>()
    function walk(nodes: BookmarkNode[]) {
      for (const node of nodes) {
        if (node.children) {
          for (const child of node.children) map.set(child.id, node.id)
          walk(node.children)
        }
      }
    }
    walk(bookmarkTree)
    return map
  }, [bookmarkTree])

  const displayRoots = useMemo(() => getDisplayRoots(bookmarkTree), [bookmarkTree])

  const sortedDisplayRoots = useMemo(() => {
    if (!pillOrder.length) return displayRoots
    const orderMap = new Map(pillOrder.map((id, i) => [id, i]))
    return [...displayRoots].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : displayRoots.indexOf(a) + pillOrder.length
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : displayRoots.indexOf(b) + pillOrder.length
      return ai - bi
    })
  }, [displayRoots, pillOrder])

  const displayedBookmarks = useMemo(() => {
    if (searchQuery.trim()) return searchBookmarks(searchQuery, bookmarkTree)
    if (selectedFolderId) {
      const folder = findNodeById(selectedFolderId, bookmarkTree)
      return folder ? getAllBookmarksInFolder(folder) : []
    }
    return getRecentBookmarks(bookmarkTree, recentMonths)
  }, [searchQuery, bookmarkTree, selectedFolderId, recentMonths])

  const sectionTitle = useMemo(() => {
    if (searchQuery.trim()) return `搜索"${searchQuery}"`
    if (selectedFolderId) {
      const folder = findNodeById(selectedFolderId, bookmarkTree)
      return folder?.title ?? '书签'
    }
    return '最近添加'
  }, [searchQuery, selectedFolderId, bookmarkTree])

  const isRecentView = !searchQuery.trim() && !selectedFolderId

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
    <div className={`app${drag ? ' app--dragging' : ''}${pillDraggingId ? ' app--pill-dragging' : ''}`}>
      {moveToast && (
        <div className="move-toast">{moveToast}</div>
      )}

      {drag && (
        <div
          className="drag-ghost"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          {drag.title || '书签'}
        </div>
      )}

      {pillGhost && (
        <div
          className="pill-drag-ghost"
          style={{ left: pillGhost.x, top: pillGhost.y }}
        >
          {pillGhost.title}
        </div>
      )}

      <div className="app-header">
        <img src="/icons/logo.png" className="app-logo" alt="" />
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

      <div className={`pills-row${drag ? ' pills-row--receive' : ''}`}>
        <button
          className={`pill${selectedFolderId === null && !searchQuery.trim() ? ' active' : ''}`}
          onClick={() => { setSelectedFolderId(null); setSearchQuery('') }}
        >
          最近
        </button>
        {sortedDisplayRoots.map((f, i) => (
          <div
            key={f.id}
            className={[
              'pill-wrapper',
              pillDraggingId === f.id ? 'pill-wrapper--dragging' : '',
              pillDraggingId === f.id && pillDropGapIndex !== null ? 'pill-wrapper--collapsed' : '',
              (() => {
                if (pillDropGapIndex === null || pillDraggingId === f.id) return ''
                const ndPills = sortedDisplayRoots.filter(r => r.id !== pillDraggingId)
                const ndIdx = ndPills.findIndex(r => r.id === f.id)
                if (ndIdx === -1) return ''
                if (pillDropGapIndex === ndIdx) return 'pill-wrapper--gap-before'
                if (pillDropGapIndex === ndIdx + 1) return 'pill-wrapper--gap-after'
                return ''
              })(),
            ].filter(Boolean).join(' ')}
            onMouseEnter={() => {
              if (drag) { setDropFolderId(f.id); dropFolderRef.current = { id: f.id, title: f.title } }
            }}
            onMouseLeave={() => {
              if (drag) { setDropFolderId(null); dropFolderRef.current = null }
            }}
          >
            <button
              className={[
                'pill',
                selectedFolderId === f.id ? 'active' : '',
                drag ? 'pill--receive' : '',
                dropFolderId === f.id ? 'pill--drop-active' : '',
                pillEditMode ? 'pill--edit' : '',
              ].filter(Boolean).join(' ')}
              style={pillEditMode ? { animationDelay: `${(i % 3) * 0.07}s` } : undefined}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if (pillEditMode) {
                  startPillDragReorder(e, f.id, f.title, sortedDisplayRoots)
                } else if (!drag) {
                  startPillLongPress(f.id)
                }
              }}
              onMouseUp={() => { if (!pillEditMode) cancelPillLongPress() }}
              onClick={() => {
                if (!drag && !pillEditMode) { setSelectedFolderId(f.id); setSearchQuery('') }
              }}
            >
              {f.title}
            </button>
            {pillEditMode && (
              <button
                className="pill-close-btn"
                onClick={(e) => { e.stopPropagation(); setDeleteFolderTarget({ id: f.id, title: f.title }) }}
              >
                ×
              </button>
            )}
          </div>
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
        {isRecentView && (
          <div className="recent-dropdown" ref={dropdownRef}>
            <button
              className={`recent-dropdown-trigger${recentOpen ? ' open' : ''}`}
              onClick={() => setRecentOpen(o => !o)}
            >
              最近 {recentMonths} 月
              <svg className={`recent-dropdown-chevron${recentOpen ? ' open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {recentOpen && (
              <div className="recent-dropdown-menu">
                {([1, 3] as const).map(m => (
                  <button
                    key={m}
                    className={`recent-dropdown-item${recentMonths === m ? ' selected' : ''}`}
                    onClick={() => { setRecentMonths(m); setRecentOpen(false) }}
                  >
                    {recentMonths === m && <span className="recent-dropdown-check">✓</span>}
                    最近 {m} 月
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-grid">
        {reorderDragId && reorderBaseList ? (
          // Reorder mode: only show direct-sibling bookmarks with a drop slot
          (() => {
            const nonDragged = reorderBaseList
              .filter(b => b.id !== reorderDragId)
              .map(b => ({
                ...b,
                folderName: showFullPath
                  ? getBookmarkPath(b.id, bookmarkTree)
                  : findFolderName(b.id, bookmarkTree),
              }))
            const els: React.ReactNode[] = []
            nonDragged.forEach((b, i) => {
              if (reorderInsertIdx === i) els.push(<div key="drop-slot" className="card-drop-slot" />)
              els.push(
                <BookmarkCard
                  key={b.id}
                  bookmark={b}
                  folders={folderOptions}
                  onUpdated={loadTree}
                  onLongPress={(pos) => startDrag(b.id, b.title, pos)}
                  isDragging={false}
                  isExiting={exitingId === b.id}
                />
              )
            })
            if (reorderInsertIdx === nonDragged.length) els.push(<div key="drop-slot" className="card-drop-slot" />)
            return els
          })()
        ) : bookmarksWithFolder.length === 0 ? (
          <div className="empty-state">
            {searchQuery.trim() ? '没有匹配的书签' : '暂无书签'}
          </div>
        ) : (
          bookmarksWithFolder.map(b => (
            <BookmarkCard
              key={b.id}
              bookmark={b}
              folders={folderOptions}
              onUpdated={loadTree}
              onLongPress={(pos) => startDrag(b.id, b.title, pos)}
              isDragging={drag?.bookmarkId === b.id}
              isExiting={exitingId === b.id}
              isDimmed={
                !!drag && !reorderDragId &&
                bookmarkParentMap.get(b.id) !== bookmarkParentMap.get(drag.bookmarkId)
              }
            />
          ))
        )}
      </div>

      <OrganizeFAB
        status={organizeStatus}
        progress={organizeProgress}
        onOrganize={handleOrganize}
      />

      {deleteFolderTarget && (
        <div className="modal-overlay" onClick={() => setDeleteFolderTarget(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>删除文件夹</h3>
              <button className="modal-close" onClick={() => setDeleteFolderTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="delete-confirm-text">
                确定要删除文件夹 <strong>「{deleteFolderTarget.title}」</strong> 及其所有书签吗？此操作不可撤销。
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setDeleteFolderTarget(null)}>取消</button>
              <button className="modal-btn danger" onClick={handleDeleteFolder}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function syncReorderedBookmark(
  draggedId: string,
  newOrder: BookmarkNode[],
  parentId: string
) {
  const newIdx = newOrder.findIndex(b => b.id === draggedId)
  const children = await chrome.bookmarks.getChildren(parentId)
  const draggedPos = children.findIndex(c => c.id === draggedId)
  if (draggedPos < 0) return

  let targetIdx: number

  if (newIdx === 0) {
    if (newOrder.length < 2) return
    const nextId = newOrder[1].id
    const nextPos = children.findIndex(c => c.id === nextId)
    if (nextPos < 0 || draggedPos < nextPos) return
    targetIdx = nextPos
  } else {
    const prevId = newOrder[newIdx - 1].id
    const prevPos = children.findIndex(c => c.id === prevId)
    if (prevPos < 0) return
    targetIdx = draggedPos < prevPos ? prevPos : prevPos + 1
  }

  if (targetIdx !== draggedPos) {
    await chrome.bookmarks.move(draggedId, { parentId, index: targetIdx })
  }
}

async function syncFolderOrderToChrome(newOrder: { id: string }[], tree: BookmarkNode[]) {
  // Build folderId -> parentId map
  const parentMap = new Map<string, string>()
  function buildMap(nodes: BookmarkNode[], parentId: string) {
    for (const node of nodes) {
      parentMap.set(node.id, parentId)
      if (node.children) buildMap(node.children, node.id)
    }
  }
  for (const root of tree) buildMap(root.children ?? [], root.id)

  // Group new order by parent
  const byParent = new Map<string, string[]>()
  for (const f of newOrder) {
    const pid = parentMap.get(f.id)
    if (!pid) continue
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(f.id)
  }

  // Reorder within each parent: move each item right after the previous one
  for (const [parentId, desiredOrder] of byParent) {
    for (let i = 0; i < desiredOrder.length; i++) {
      if (i === 0) {
        const children = await chrome.bookmarks.getChildren(parentId)
        const desiredSet = new Set(desiredOrder)
        const minIdx = children.findIndex(c => desiredSet.has(c.id))
        await chrome.bookmarks.move(desiredOrder[0], { parentId, index: minIdx })
      } else {
        const children = await chrome.bookmarks.getChildren(parentId)
        const prevIdx = children.findIndex(c => c.id === desiredOrder[i - 1])
        if (prevIdx >= 0) {
          await chrome.bookmarks.move(desiredOrder[i], { parentId, index: prevIdx + 1 })
        }
      }
    }
  }
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
