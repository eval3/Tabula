import { useState } from 'react'
import type { BookmarkNode } from '../utils'

interface Props {
  bookmarks: BookmarkNode[]
  folderName: string
  onDragStart: (id: string) => void
  onDragEnd: () => void
}

export default function BookmarkList({ bookmarks, folderName, onDragStart, onDragEnd }: Props) {
  return (
    <main className="main">
      <div className="main-header">
        <div>
          <div className="main-title">{folderName}</div>
          <div className="main-count">{bookmarks.length} 个书签</div>
        </div>
      </div>
      {bookmarks.length === 0 ? (
        <div className="main-empty">该文件夹下暂无书签</div>
      ) : (
        bookmarks.map(b => (
          <BookmarkItem key={b.id} bookmark={b} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))
      )}
    </main>
  )
}

function BookmarkItem({
  bookmark,
  onDragStart,
  onDragEnd,
}: {
  bookmark: BookmarkNode
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const [faviconError, setFaviconError] = useState(false)

  return (
    <div
      className={`bookmark-item${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('bookmarkId', bookmark.id)
        setDragging(true)
        onDragStart(bookmark.id)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragEnd()
      }}
      onClick={() => {
        if (bookmark.url) window.location.href = bookmark.url
      }}
    >
      <span className="drag-handle">⠿</span>
      {!faviconError && bookmark.url ? (
        <img
          className="favicon"
          src={`chrome://favicon2/?size=16&page_url=${encodeURIComponent(bookmark.url)}`}
          alt=""
          onError={() => setFaviconError(true)}
        />
      ) : (
        <div className="favicon-placeholder" />
      )}
      <div className="bookmark-info">
        <div className="bookmark-title">{bookmark.title || bookmark.url}</div>
        <div className="bookmark-url">{bookmark.url}</div>
      </div>
    </div>
  )
}
