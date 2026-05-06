import { useState } from 'react'
import type { BookmarkNode } from '../utils'
import { useLongPress } from '../hooks/useLongPress'

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
  onUpdated: () => void
  onLongPress?: (pos: { x: number; y: number }) => void
  isDragging?: boolean
  isExiting?: boolean
  isDimmed?: boolean
}

export default function BookmarkCard({ bookmark, folders, onUpdated, onLongPress, isDragging, isExiting, isDimmed }: Props) {
  const url = bookmark.url ?? ''
  const longPress = useLongPress((pos) => onLongPress?.(pos))
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(bookmark.title)
  const [editFolderId, setEditFolderId] = useState<string>('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)

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
          <button className="card-edit-btn" onClick={openEdit} title="编辑书签">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="card-delete-btn" onClick={openDeleteModal} title="删除书签">
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
          <div className="card-folder-tag">
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

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑书签</h3>
              <button className="modal-close" onClick={() => setEditing(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">名称</label>
              <input
                className="modal-input"
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="书签名称"
              />
              <label className="modal-label">分组</label>
              <select
                className="modal-select"
                value={editFolderId}
                onChange={e => setEditFolderId(e.target.value)}
              >
                <option value="">不修改</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setEditing(false)}>取消</button>
              <button className="modal-btn save" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>删除书签</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="delete-confirm-text">
                确认删除「<strong>{bookmark.title || url}</strong>」？删除后无法恢复。
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(false)}>取消</button>
              <button className="modal-btn danger" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
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
