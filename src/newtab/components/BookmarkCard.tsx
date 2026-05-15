import { useState, useMemo } from 'react'
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
  const [editTitle, setEditTitle] = useState(bookmark.title)
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

  function openEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditTitle(bookmark.title)
    setEditFolderId(findParentFolderId(bookmark.id, folders))
    setEditing(true)
  }

  async function handleSave() {
    const newTitle = editTitle.trim() || bookmark.title
    if (newTitle !== bookmark.title) {
      await chrome.bookmarks.update(bookmark.id, { title: newTitle })
    }
    const currentParentId = findParentFolderId(bookmark.id, folders)
    if (editFolderId && editFolderId !== currentParentId) {
      await chrome.bookmarks.move(bookmark.id, { parentId: editFolderId })
    }
    setEditing(false)
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
      await chrome.bookmarks.move(bookmark.id, { parentId: folderId })
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
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalEditBookmark')}</h3>
              <button className="modal-close" onClick={() => setEditing(false)}>×</button>
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
              <label className="modal-label">{t('groupLabel')}</label>
              <select
                className="modal-select"
                value={editFolderId}
                onChange={e => setEditFolderId(e.target.value)}
              >
                <option value="">{t('noChangeOption')}</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setEditing(false)}>{t('cancelBtn')}</button>
              <button className="modal-btn save" onClick={handleSave}>{t('saveBtn')}</button>
            </div>
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
