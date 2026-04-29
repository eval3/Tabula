import type { BookmarkNode } from '../utils'

interface SharedProps {
  expandedIds: Set<string>
  selectedFolderId: string | null
  dragOverFolderId: string | null
  onSelectFolder: (id: string) => void
  onToggleExpand: (id: string) => void
  onDragOver: (folderId: string) => void
  onDragLeave: () => void
  onDrop: (folderId: string) => void
}

interface FolderTreeProps extends SharedProps {
  folders: BookmarkNode[]
  onExpandAll: () => void
  onCollapseAll: () => void
}

export default function FolderTree({
  folders, onExpandAll, onCollapseAll, ...shared
}: FolderTreeProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-label">Folders</span>
        <div className="sidebar-actions">
          <button className="tree-icon-btn" title="全部展开" onClick={onExpandAll}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 5V2h3M11 5V2H8M2 8v3h3M11 8v3H8" />
            </svg>
          </button>
          <button className="tree-icon-btn" title="全部收起" onClick={onCollapseAll}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M5 2v3H2M8 2v3h3M5 11V8H2M8 11V8h3" />
            </svg>
          </button>
        </div>
      </div>
      {folders.map(f => (
        <FolderNode key={f.id} node={f} depth={0} {...shared} />
      ))}
    </aside>
  )
}

function FolderNode({
  node, depth,
  expandedIds, selectedFolderId, dragOverFolderId,
  onSelectFolder, onToggleExpand, onDragOver, onDragLeave, onDrop,
}: SharedProps & { node: BookmarkNode; depth: number }) {
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedFolderId === node.id
  const isDragOver = dragOverFolderId === node.id
  const childFolders = (node.children ?? []).filter(c => !c.url)
  const directBookmarkCount = (node.children ?? []).filter(c => !!c.url).length
  const hasChildren = childFolders.length > 0

  const classes = ['folder-item', isSelected && 'active', isDragOver && 'drop-target']
    .filter(Boolean).join(' ')

  const shared = { expandedIds, selectedFolderId, dragOverFolderId, onSelectFolder, onToggleExpand, onDragOver, onDragLeave, onDrop }

  return (
    <>
      <div
        className={classes}
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => onSelectFolder(node.id)}
        onDragOver={(e) => { e.preventDefault(); onDragOver(node.id) }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          e.stopPropagation()
          onDragLeave()
        }}
        onDrop={(e) => { e.preventDefault(); onDrop(node.id) }}
      >
        {hasChildren ? (
          <span
            className={`expand-arrow${isExpanded ? ' open' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id) }}
          >▶</span>
        ) : (
          <span style={{ width: 10, display: 'inline-block', flexShrink: 0 }} />
        )}
        <span className="folder-icon">{isExpanded && hasChildren ? '📂' : '📁'}</span>
        <span className="folder-name">{node.title}</span>
        {directBookmarkCount > 0 && (
          <span className="folder-count">{directBookmarkCount}</span>
        )}
      </div>
      {isExpanded && childFolders.map(child => (
        <FolderNode key={child.id} node={child} depth={depth + 1} {...shared} />
      ))}
    </>
  )
}
