export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
}

const SYSTEM_IDS = new Set(['0', '1', '2', '3'])

export function getDisplayRoots(tree: BookmarkNode[]): BookmarkNode[] {
  const roots: BookmarkNode[] = []
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (SYSTEM_IDS.has(node.id)) {
        if (node.children) traverse(node.children)
      } else if (!node.url) {
        roots.push(node)
      }
    }
  }
  traverse(tree)
  return roots
}

export function getAllFolderIds(nodes: BookmarkNode[]): string[] {
  const ids: string[] = []
  function traverse(node: BookmarkNode) {
    if (!node.url) {
      ids.push(node.id)
      node.children?.forEach(traverse)
    }
  }
  nodes.forEach(traverse)
  return ids
}

export function searchBookmarks(query: string, tree: BookmarkNode[]): BookmarkNode[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const results: BookmarkNode[] = []
  function traverse(node: BookmarkNode) {
    if (node.url) {
      if (node.title.toLowerCase().includes(q) || node.url.toLowerCase().includes(q)) {
        results.push(node)
      }
    }
    node.children?.forEach(traverse)
  }
  tree.forEach(traverse)
  return results
}

export function findNodeById(id: string, tree: BookmarkNode[]): BookmarkNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(id, node.children)
      if (found) return found
    }
  }
  return null
}
