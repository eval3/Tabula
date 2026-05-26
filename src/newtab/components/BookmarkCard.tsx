import { useState, useMemo, useEffect, useRef } from 'react'
import type { BookmarkNode } from '../utils'
import { useLongPress } from '../hooks/useLongPress'
import { t } from '../../lib/i18n'

const PALETTE = ['#a855f7', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#6366f1', '#14b8a6']

function hashCode(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

interface Props {
  bookmark: BookmarkNode & { folderName?: string }
  folders: BookmarkNode[]
  tree: BookmarkNode[]
  onUpdated: () => void
  onLongPress?: (pos: { x: number; y: number }) => void
  isDragging?: boolean
  isExiting?: boolean
  isDimmed?: boolean
}

export default function BookmarkCard({ bookmark, folders, tree, onUpdated, onLongPress, isDragging, isExiting, isDimmed }: Props) {
  const url = bookmark.url ?? ''
  const longPress = useLongPress(onLongPress)
  const [editing, setEditing] = useState(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [editTitle, setEditTitle] = useState(bookmark.title)
  const [editUrl, setEditUrl] = useState(url)
  const [editFolderId, setEditFolderId] = useState<string>('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null)

  let hostname = url
  try { hostname = new URL(url).hostname } catch {}

  function handleClick(e: React.MouseEvent) {
    if (longPress.wasLongPressed()) return
    if ((e.target as HTMLElement).closest('.card-actions')) return
    if (url) window.open(url, '_blank')
  }

  const dotColor = bookmark.folderName
    ? PALETTE[hashCode(bookmark.folderName) % PALETTE.length]
    : undefined

  function closeEdit() {
    setEditing(false)
    setPickingFolder(false)
  }

  function openEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditTitle(bookmark.title)
    setEditUrl(url)
    setEditFolderId(findParentFolderId(bookmark.id, folders))
    setPickingFolder(false)
    setEditing(true)
  }

  async function handleSave() {
    const newTitle = editTitle.trim() || bookmark.title
    const newUrl = editUrl.trim() || url
    if (newTitle !== bookmark.title || newUrl !== url) {
      await chrome.bookmarks.update(bookmark.id, { title: newTitle, url: newUrl })
    }
    const currentParentId = findParentFolderId(bookmark.id, folders)
    if (editFolderId !== currentParentId) {
      await chrome.bookmarks.move(bookmark.id, { parentId: editFolderId })
    }
    closeEdit()
    onUpdated()
  }

  function openDeleteModal(e: React.MouseEvent) {
    e.stopPropagation()
    setShowDeleteModal(true)
  }

  function handleTagClick(e: React.MouseEvent) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPickerRect(rect)
    setShowFolderPicker(true)
  }

  async function handlePickerSelect(folderId: string) {
    setShowFolderPicker(false)
    const currentParentId = findParentFolderId(bookmark.id, folders)
    if (folderId !== currentParentId) {
      await chrome.bookmarks.move(bookmark.id, { parentId: folderId, index: 0 })
      onUpdated()
    }
  }

  async function confirmDelete() {
    await chrome.bookmarks.remove(bookmark.id)
    setShowDeleteModal(false)
    onUpdated()
  }

  const cardClass = [
    'bookmark-card',
    isDragging ? 'bookmark-card--dragging' : '',
    isExiting ? 'bookmark-card--exiting' : '',
    isDimmed ? 'bookmark-card--dimmed' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className={cardClass} onClick={handleClick} onMouseDown={longPress.onMouseDown} data-bookmark-id={bookmark.id}>
        <div className="card-actions">
          <button className="card-edit-btn" onClick={openEdit} title={t('editBookmarkTitle')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="card-delete-btn" onClick={openDeleteModal} title={t('deleteBookmarkTitle')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
        <div className="card-favicon-row">
          <Favicon url={url} />
          <span className="card-domain">{hostname}</span>
        </div>
        <div className="card-title">{bookmark.title || url}</div>
        {bookmark.folderName && (
          <div className="card-folder-tag card-folder-tag--clickable" onClick={handleTagClick}>
            <span className="folder-dot" style={{ backgroundColor: dotColor }} />
            <div className="breadcrumb">
              {bookmark.folderName.split('/').map((crumb, i, arr) => (
                <span key={i} className="breadcrumb-item">
                  {i > 0 && (
                    <svg className="breadcrumb-sep" width="8" height="12" viewBox="4 2 16 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  )}
                  <span className={`breadcrumb-crumb${i === arr.length - 1 ? ' leaf' : ''}`}>{crumb}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showFolderPicker && pickerRect && (
        <FolderTreePicker
          tree={tree}
          currentFolderId={findParentFolderId(bookmark.id, folders)}
          anchorRect={pickerRect}
          onSelect={handlePickerSelect}
          onClose={() => setShowFolderPicker(false)}
        />
      )}

      {editing && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            {!pickingFolder ? (
              <>
                <div className="modal-header">
                  <h3>{t('modalEditBookmark')}</h3>
                  <button className="modal-close" onClick={closeEdit}>×</button>
                </div>
                <div className="modal-body">
                  <label className="modal-label">{t('nameLabel')}</label>
                  <input
                    className="modal-input"
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder={t('bookmarkNamePlaceholder')}
                  />
                  <label className="modal-label">{t('urlLabel')}</label>
                  <input
                    className="modal-input"
                    type="url"
                    value={editUrl}
                    onChange={e => setEditUrl(e.target.value)}
                    placeholder={t('bookmarkUrlPlaceholder')}
                  />
                  <label className="modal-label">{t('groupLabel')}</label>
                  <button className="modal-folder-btn" onClick={() => setPickingFolder(true)}>
                    <span>{folders.find(f => f.id === editFolderId)?.title ?? ''}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </button>
                </div>
                <div className="modal-footer">
                  <button className="modal-btn cancel" onClick={closeEdit}>{t('cancelBtn')}</button>
                  <button className="modal-btn save" onClick={handleSave}>{t('saveBtn')}</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-header modal-header--sub">
                  <button className="modal-back-btn" onClick={() => setPickingFolder(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <h3>{t('groupLabel')}</h3>
                  <button className="modal-close" onClick={closeEdit}>×</button>
                </div>
                <div className="modal-body modal-body--tree">
                  <InlineFolderTree
                    tree={tree}
                    selectedId={editFolderId}
                    onSelect={(id) => { setEditFolderId(id); setPickingFolder(false) }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalDeleteBookmark')}</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="delete-confirm-text">
                {t('deleteBookmarkConfirm', { title: bookmark.title || url })}
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(false)}>{t('cancelBtn')}</button>
              <button className="modal-btn danger" onClick={confirmDelete}>{t('confirmDeleteBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const SYS_IDS = new Set(['0', '1', '2', '3'])
const SYS_TITLES = new Set(['书签栏', '其他书签', '移动设备书签', 'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks', '書籤列', '其他書籤', '行動裝置書籤'])

function FolderTreePicker({
  tree,
  currentFolderId,
  anchorRect,
  onSelect,
  onClose,
}: {
  tree: BookmarkNode[]
  currentFolderId: string
  anchorRect: DOMRect
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(currentFolderId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const initialExpanded = useMemo(() => {
    function findAncestors(targetId: string, nodes: BookmarkNode[]): string[] | null {
      for (const node of nodes) {
        if (node.id === targetId) return []
        if (node.children) {
          const sub = findAncestors(targetId, node.children)
          if (sub !== null) return [node.id, ...sub]
        }
      }
      return null
    }
    const ancestors = findAncestors(currentFolderId, tree) ?? []
    return new Set(ancestors.filter(id => !SYS_IDS.has(id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const effectiveExpanded = expanded.size > 0 ? expanded : initialExpanded

  function toggleExpand(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpanded(prev => {
      const base = prev.size > 0 ? prev : initialExpanded
      const next = new Set(base)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleRowClick(node: BookmarkNode, hasSubs: boolean, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedId(node.id)
    if (hasSubs) {
      setExpanded(prev => {
        const base = prev.size > 0 ? prev : initialExpanded
        const next = new Set(base)
        next.has(node.id) ? next.delete(node.id) : next.add(node.id)
        return next
      })
    }
  }

  function renderNodes(nodes: BookmarkNode[], depth: number): React.ReactNode[] {
    const result: React.ReactNode[] = []
    for (const node of nodes) {
      if (node.url) continue
      const isSys = SYS_IDS.has(node.id) || SYS_TITLES.has(node.title)
      if (isSys) {
        if (node.title) {
          result.push(<div key={`sec-${node.id}`} className="folder-picker-section">{node.title}</div>)
        }
        if (node.children) result.push(...renderNodes(node.children, depth))
        continue
      }
      const hasSubs = (node.children ?? []).some(c => !c.url)
      const isOpen = effectiveExpanded.has(node.id)
      const isSelected = node.id === selectedId
      result.push(
        <div
          key={node.id}
          className={`folder-picker-row${isSelected ? ' folder-picker-row--current' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={(e) => handleRowClick(node, hasSubs, e)}
        >
          <button
            className="folder-picker-chevron"
            style={{ visibility: hasSubs ? 'visible' : 'hidden' }}
            onClick={(e) => toggleExpand(node.id, e)}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <span className="folder-picker-name">{node.title}</span>
          {isSelected && <span className="folder-picker-check">✓</span>}
        </div>
      )
      if (isOpen && node.children) {
        result.push(...renderNodes(node.children, depth + 1))
      }
    }
    return result
  }

  const pickerW = 250, pickerH = 320
  const top = anchorRect.bottom + 4 + pickerH > window.innerHeight
    ? Math.max(4, anchorRect.top - pickerH - 4)
    : anchorRect.bottom + 4
  const left = anchorRect.left + pickerW > window.innerWidth
    ? Math.max(4, anchorRect.right - pickerW)
    : anchorRect.left

  return (
    <>
      <div className="folder-picker-overlay" onClick={(e) => { e.stopPropagation(); onClose() }} />
      <div
        className="folder-picker"
        style={{ position: 'fixed', top, left, width: pickerW, maxHeight: pickerH, zIndex: 9999 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="folder-picker-header">
          <span>{t('moveToLabel')}</span>
          <button
            className="folder-picker-confirm"
            onClick={() => onSelect(selectedId)}
          >
            {t('confirmBtn')}
          </button>
        </div>
        <div className="folder-picker-scroll">
          {renderNodes(tree, 0)}
        </div>
      </div>
    </>
  )
}

function InlineFolderTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: BookmarkNode[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selectedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  function renderNodes(nodes: BookmarkNode[], depth: number): React.ReactNode[] {
    const result: React.ReactNode[] = []
    for (const node of nodes) {
      if (node.url) continue
      const isSys = SYS_IDS.has(node.id) || SYS_TITLES.has(node.title)
      if (isSys) {
        if (node.title) {
          result.push(
            <div key={`sec-${node.id}`} className="modal-tree-section">
              {node.title}
            </div>
          )
        }
        if (node.children) result.push(...renderNodes(node.children, depth))
        continue
      }
      const isSelected = node.id === selectedId
      const leftPad = 10 + depth * 14
      result.push(
        <div
          key={node.id}
          ref={isSelected ? selectedRef : undefined}
          className={`modal-tree-row${isSelected ? ' modal-tree-row--selected' : ''}`}
          style={{ paddingLeft: leftPad }}
          onClick={() => onSelect(node.id)}
        >
          {Array.from({ length: depth }).map((_, i) => (
            <span key={i} className="modal-tree-guide" style={{ left: 10 + i * 14 + 5 }} aria-hidden />
          ))}
          <svg className="modal-tree-folder-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
          <span className="modal-tree-name">{node.title}</span>
          {isSelected && (
            <svg className="modal-tree-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )
      if (node.children) result.push(...renderNodes(node.children, depth + 1))
    }
    return result
  }

  return <div className="modal-tree">{renderNodes(tree, 0)}</div>
}

function findParentFolderId(bookmarkId: string, folders: BookmarkNode[]): string {
  for (const f of folders) {
    if (f.children?.some(c => c.id === bookmarkId)) return f.id
  }
  return ''
}

function Favicon({ url }: { url: string }) {
  const [error, setError] = useState(false)

  let hostname = url
  try { hostname = new URL(url).hostname } catch {}

  if (!url || error) {
    return <div className="favicon-placeholder" />
  }

  return (
    <img
      className="card-favicon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
      alt=""
      onError={() => setError(true)}
    />
  )
}
