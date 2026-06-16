import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import BookmarkCard from './components/BookmarkCard'
import OrganizeFAB from './components/OrganizeFAB'
import {
  getDisplayRoots, searchBookmarks, findNodeById,
  getRecentBookmarks, getRecentlyUsedBookmarks, getAllBookmarksInFolder, getAllFolders, getBookmarkPath,
  getUncategorizedBookmarks,
  type BookmarkNode,
} from './utils'
import { previewOrganize, applyOrganize, type OrganizeStatus, type OrganizeProgress, type PreviewItem, type OrganizePrefs } from '../lib/organize'
import { t } from '../lib/i18n'

interface DragState {
  bookmarkId: string
  title: string
  x: number
  y: number
}

// 虚拟分组：不在任何文件夹下的根目录书签
const UNCATEGORIZED_ID = '__uncategorized__'

// 预设背景 ID
type PresetBgType = 'light' | 'gradient' | 'mountain' | 'forest' | 'ocean' | 'desert' | 'aurora' | 'lavender' | 'autumn' | 'snow' | 'sunset' | 'tropical' | 'lake' | 'hills'
// 自定义背景格式为 'custom:{id}'，整体用 string
type BgType = PresetBgType | string

interface CustomBgItem {
  id: string
  dataUrl: string
}

type TKey = Parameters<typeof t>[0]

const BG_OPTIONS: { id: PresetBgType; labelKey: TKey; cls: string }[] = [
  { id: 'gradient', labelKey: 'bgNameGradient', cls: 'bg-option-gradient'  },
  { id: 'light',    labelKey: 'bgNameLight',    cls: 'bg-option-light'     },
  { id: 'mountain', labelKey: 'bgNameMountain', cls: 'bg-option-mountain'  },
  { id: 'forest',   labelKey: 'bgNameForest',   cls: 'bg-option-forest'    },
  { id: 'ocean',    labelKey: 'bgNameOcean',    cls: 'bg-option-ocean'     },
  { id: 'desert',   labelKey: 'bgNameDesert',   cls: 'bg-option-desert'    },
  { id: 'aurora',   labelKey: 'bgNameAurora',   cls: 'bg-option-aurora'    },
  { id: 'lavender', labelKey: 'bgNameLavender', cls: 'bg-option-lavender'  },
  { id: 'autumn',   labelKey: 'bgNameAutumn',   cls: 'bg-option-autumn'    },
  { id: 'snow',     labelKey: 'bgNameSnow',     cls: 'bg-option-snow'      },
  { id: 'sunset',   labelKey: 'bgNameSunset',   cls: 'bg-option-sunset'    },
  { id: 'tropical', labelKey: 'bgNameTropical', cls: 'bg-option-tropical'  },
  { id: 'lake',     labelKey: 'bgNameLake',     cls: 'bg-option-lake'      },
  { id: 'hills',    labelKey: 'bgNameHills',    cls: 'bg-option-hills'     },
]

export default function App() {
  const [bg, setBg] = useState<BgType>(() => {
    const saved = localStorage.getItem('sbBg') || 'gradient'
    // 兼容旧版 'custom'（无 ID），降级到 gradient
    return saved === 'custom' ? 'gradient' : saved
  })
  const [bgPanelOpen, setBgPanelOpen] = useState(false)
  const bgPanelRef = useRef<HTMLDivElement>(null)
  const [customBgs, setCustomBgs] = useState<CustomBgItem[]>([])
  const customBgInputRef = useRef<HTMLInputElement>(null)
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [organizeStatus, setOrganizeStatus] = useState<OrganizeStatus>('idle')
  const [organizeProgress, setOrganizeProgress] = useState<OrganizeProgress>({ done: 0, total: 0 })
  const [organizePreview, setOrganizePreview] = useState<PreviewItem[] | null>(null)
  const [recentMonths, setRecentMonths] = useState(1)
  const [recentOpen, setRecentOpen] = useState(false)
  const [showRecentlyUsed, setShowRecentlyUsed] = useState(true)
  const [recentlyUsedBookmarks, setRecentlyUsedBookmarks] = useState<BookmarkNode[]>([])
  const [recentlyUsedMonths, setRecentlyUsedMonths] = useState(1)
  const [recentlyUsedOpen, setRecentlyUsedOpen] = useState(false)
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
  const [showAddFolderModal, setShowAddFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [subFolderNavStack, setSubFolderNavStack] = useState<string[]>([])
  const [subFolderEditMode, setSubFolderEditMode] = useState(false)
  const [deleteSubFolderTarget, setDeleteSubFolderTarget] = useState<{ id: string; title: string } | null>(null)
  const [showAddSubFolderModal, setShowAddSubFolderModal] = useState(false)
  const [newSubFolderName, setNewSubFolderName] = useState('')
  const [subTabDraggingId, setSubTabDraggingId] = useState<string | null>(null)
  const [subTabDropGapIndex, setSubTabDropGapIndex] = useState<number | null>(null)
  const [subTabGhost, setSubTabGhost] = useState<{ title: string; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: string; title: string; type: 'pill' | 'subtab'; x: number; y: number } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const usedDropdownRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevOrganizeStatusRef = useRef<OrganizeStatus>('idle')
  const dragRef = useRef<DragState | null>(null)
  const dropFolderRef = useRef<{ id: string; title: string } | null>(null)
  const subTabDragIdRef = useRef<string | null>(null)
  const subTabGhostRef = useRef<{ title: string; x: number; y: number } | null>(null)
  const subTabDropGapRef = useRef<number | null>(null)
  const subTabOriginalGapRef = useRef<number | null>(null)
  const pillDragIdRef = useRef<string | null>(null)
  const pillGhostRef = useRef<{ title: string; x: number; y: number } | null>(null)
  const pillDropGapRef = useRef<number | null>(null)
  const pillDragOriginalGapRef = useRef<number | null>(null)
  const pillDragActiveRef = useRef(false)
  const subTabDragActiveRef = useRef(false)
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
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      setScrolled(el.scrollTop > 0)
      el.classList.add('app-scroll--scrolling')
      if (scrollingTimerRef.current) clearTimeout(scrollingTimerRef.current)
      scrollingTimerRef.current = setTimeout(() => {
        el.classList.remove('app-scroll--scrolling')
      }, 800)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollingTimerRef.current) clearTimeout(scrollingTimerRef.current)
    }
  }, [])

  // 加载所有已保存的自定义背景（兼容旧版单张存储）
  useEffect(() => {
    chrome.storage.local.get(['sbCustomBgs', 'sbCustomBgData'], (data) => {
      if (Array.isArray(data.sbCustomBgs)) {
        // sbCustomBgs key 已存在（哪怕是空数组）——直接使用，不再触发迁移
        setCustomBgs(data.sbCustomBgs)
      } else if (typeof data.sbCustomBgData === 'string') {
        // 仅当 sbCustomBgs 从未写入过时，才迁移旧版单张存储
        const bgs: CustomBgItem[] = [{ id: 'migrated', dataUrl: data.sbCustomBgData }]
        chrome.storage.local.set({ sbCustomBgs: bgs })
        setCustomBgs(bgs)
      }
      // 两者都不存在时保持默认空数组
    })
  }, [])

  // 应用背景到 html 元素
  useEffect(() => {
    const root = document.documentElement
    if (bg === 'gradient') {
      delete root.dataset.bg
      root.style.removeProperty('--custom-bg-url')
    } else if (bg.startsWith('custom:')) {
      root.dataset.bg = 'custom'
      const id = bg.slice(7)
      const item = customBgs.find(b => b.id === id)
      if (item) {
        root.style.setProperty('--custom-bg-url', `url("${item.dataUrl}")`)
      }
    } else {
      root.dataset.bg = bg
      root.style.removeProperty('--custom-bg-url')
    }
    localStorage.setItem('sbBg', bg)
  }, [bg, customBgs])

  // 压缩并保存上传的图片
  function handleCustomBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const maxW = 1920, maxH = 1080
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const id = Date.now().toString()
      const newItem: CustomBgItem = { id, dataUrl }
      const updated = [...customBgs, newItem]
      setCustomBgs(updated)
      chrome.storage.local.set({ sbCustomBgs: updated })
      setBg(`custom:${id}`)
      setBgPanelOpen(false)
    }
    img.onerror = () => URL.revokeObjectURL(objectUrl)
    img.src = objectUrl
  }

  // 删除指定自定义背景
  function handleDeleteCustomBg(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const updated = customBgs.filter(b => b.id !== id)
    setCustomBgs(updated)
    chrome.storage.local.set({ sbCustomBgs: updated })
    // 若删除的是当前激活背景，切换到剩余第一张或默认渐变
    if (bg === `custom:${id}`) {
      setBg(updated.length > 0 ? `custom:${updated[0].id}` : 'gradient')
    }
  }

  useEffect(() => {
    if (!bgPanelOpen) return
    function handleClick(e: MouseEvent) {
      if (bgPanelRef.current && !bgPanelRef.current.contains(e.target as Node)) {
        setBgPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [bgPanelOpen])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') loadTree()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

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
    if (!recentlyUsedOpen) return
    function handleClick(e: MouseEvent) {
      if (usedDropdownRef.current && !usedDropdownRef.current.contains(e.target as Node)) {
        setRecentlyUsedOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [recentlyUsedOpen])

  useEffect(() => {
    if (!showRecentlyUsed || !bookmarkTree.length) return
    getRecentlyUsedBookmarks(bookmarkTree, recentlyUsedMonths).then(setRecentlyUsedBookmarks)
  }, [showRecentlyUsed, bookmarkTree, recentlyUsedMonths])

  useEffect(() => {
    if (!pillEditMode) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.pill-wrapper')) setPillEditMode(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pillEditMode])

  useEffect(() => {
    setSubFolderNavStack([])
    setSubFolderEditMode(false)
  }, [selectedFolderId])

  useEffect(() => {
    if (!subFolderEditMode) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.subfolder-tab-wrapper') && !target.closest('.subfolder-tab-add-btn')) {
        setSubFolderEditMode(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [subFolderEditMode])

  useEffect(() => {
    if (!contextMenu) return
    function handleClick() { setContextMenu(null) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  useEffect(() => {
    const prev = prevOrganizeStatusRef.current
    prevOrganizeStatusRef.current = organizeStatus
    if (organizeStatus === 'loading') {
      chrome.runtime.sendMessage({ type: 'organize:start' })
    } else if (prev === 'loading') {
      const s = organizeStatus === 'success' ? 'success' : organizeStatus === 'error' ? 'error' : null
      chrome.runtime.sendMessage({ type: 'organize:stop', status: s })
    }
  }, [organizeStatus])

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

  function startSubTabDragReorder(startX: number, startY: number, id: string, title: string, currentOrder: BookmarkNode[]) {
    subTabDragIdRef.current = id
    setSubTabDraggingId(id)
    subTabOriginalGapRef.current = currentOrder.findIndex(f => f.id === id)
    const ghost = { title, x: startX, y: startY }
    subTabGhostRef.current = ghost
    setSubTabGhost(ghost)

    function calcGapIndex(clientX: number, clientY: number): number {
      const wrappers = Array.from(
        document.querySelectorAll<HTMLElement>('.subfolder-tab-wrapper:not(.subfolder-tab-wrapper--dragging)')
      )
      if (wrappers.length === 0) return 0
      const rects = wrappers.map(el => el.getBoundingClientRect())
      const rowCenters = rects.map(r => (r.top + r.bottom) / 2)
      const closestRowY = rowCenters.reduce((best, cy) =>
        Math.abs(cy - clientY) < Math.abs(best - clientY) ? cy : best
      , rowCenters[0])
      const rowIndices = wrappers.map((_, i) => i).filter(i => Math.abs(rowCenters[i] - closestRowY) < 20)
      for (const i of rowIndices) {
        if (clientX < rects[i].left + rects[i].width / 2) return i
      }
      return rowIndices[rowIndices.length - 1] + 1
    }

    function onMove(ev: MouseEvent) {
      const updated = { title, x: ev.clientX, y: ev.clientY }
      subTabGhostRef.current = updated
      setSubTabGhost(updated)
      const raw = calcGapIndex(ev.clientX, ev.clientY)
      const gap = raw === subTabOriginalGapRef.current ? null : raw
      if (gap !== subTabDropGapRef.current) {
        subTabDropGapRef.current = gap
        setSubTabDropGapIndex(gap)
      }
    }

    async function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const sourceId = subTabDragIdRef.current
      const gapIdx = subTabDropGapRef.current
      const originalGap = subTabOriginalGapRef.current
      subTabDragIdRef.current = null
      subTabDropGapRef.current = null
      subTabOriginalGapRef.current = null
      subTabGhostRef.current = null
      setSubTabDraggingId(null)
      setSubTabGhost(null)
      setSubTabDropGapIndex(null)
      if (!sourceId || gapIdx === null || gapIdx === originalGap) return
      const source = currentOrder.find(f => f.id === sourceId)!
      const withoutSource = currentOrder.filter(f => f.id !== sourceId)
      withoutSource.splice(gapIdx, 0, source)
      await syncFolderOrderToChrome(withoutSource, bookmarkTree)
      await loadTree()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function handleDeleteSubFolder() {
    if (!deleteSubFolderTarget) return
    await chrome.bookmarks.removeTree(deleteSubFolderTarget.id)
    const idx = subFolderNavStack.indexOf(deleteSubFolderTarget.id)
    if (idx !== -1) setSubFolderNavStack(s => s.slice(0, idx))
    setDeleteSubFolderTarget(null)
    setSubFolderEditMode(false)
    await loadTree()
  }

  async function handleAddSubFolder() {
    const name = newSubFolderName.trim()
    if (!name || !currentViewFolderId) return
    try {
      await chrome.bookmarks.create({ title: name, parentId: currentViewFolderId })
      setNewSubFolderName('')
      setShowAddSubFolderModal(false)
      await loadTree()
    } catch (err) {
      console.error('创建子文件夹失败:', err)
    }
  }

  async function handleAddFolder() {
    const name = newFolderName.trim()
    if (!name) return
    try {
      const barId = getBookmarksBarId(bookmarkTree)
      await chrome.bookmarks.create({ title: name, parentId: barId })
      setNewFolderName('')
      setShowAddFolderModal(false)
      await loadTree()
    } catch (err) {
      console.error('创建文件夹失败:', err)
    }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderTarget) return
    await chrome.bookmarks.removeTree(deleteFolderTarget.id)
    if (selectedFolderId === deleteFolderTarget.id) setSelectedFolderId(null)
    setDeleteFolderTarget(null)
    setPillEditMode(false)
    await loadTree()
  }

  async function handleRenameFolder() {
    const name = renameValue.trim()
    if (!name || !renameTarget) return
    await chrome.bookmarks.update(renameTarget.id, { title: name })
    setRenameTarget(null)
    setRenameValue('')
    await loadTree()
  }

  function startPillDragReorder(startX: number, startY: number, id: string, title: string, currentOrder: { id: string }[]) {
    pillDragIdRef.current = id
    setPillDraggingId(id)
    pillDragOriginalGapRef.current = currentOrder.findIndex(f => f.id === id)
    const ghost = { title, x: startX, y: startY }
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

    let currentClientX = pos.x
    let currentClientY = pos.y
    let scrollRafId: number | null = null

    // Enable reorder mode in folder view
    if (selectedFolderId) {
      const dragParentId = bookmarkParentMap.get(bookmarkId)
      if (dragParentId) {
        // Capture original card rects BEFORE React re-renders (all cards still in DOM)
        const initRects = new Map<string, DOMRect>()
        document.querySelectorAll<HTMLElement>('[data-bookmark-id]').forEach(el => {
          initRects.set(el.dataset.bookmarkId!, el.getBoundingClientRect())
        })
        capturedRectsRef.current = initRects

        // Use the full displayed list so the slot starts at the card's visual position
        const baseList = displayedBookmarks
        const origIdx = Math.max(0, baseList.findIndex(b => b.id === bookmarkId))
        reorderBaseListRef.current = baseList
        reorderDragIdRef.current = bookmarkId
        reorderParentIdRef.current = dragParentId
        reorderInsertIdxRef.current = origIdx
        setReorderBaseList(baseList)
        setReorderDragId(bookmarkId)
        setReorderInsertIdx(origIdx)
      }
    }

    function calcReorderInsertIdx(clientX: number, clientY: number): number | null {
      const rectsMap = capturedRectsRef.current
      const baseList = reorderBaseListRef.current
      if (!rectsMap || !baseList) return null

      const nonDragged = baseList
        .filter(b => b.id !== bookmarkId)
        .map(b => rectsMap.get(b.id))
        .filter((r): r is DOMRect => !!r)

      if (nonDragged.length === 0) return null

      const currentSlot = reorderInsertIdxRef.current ?? 0
      for (let i = 0; i < nonDragged.length; i++) {
        const r = nonDragged[i]
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          // Place slot at the card's current visual position:
          // S > i → slot is after this card, card sits at display-pos i → insert before
          // S ≤ i → slot is before/at this card, card sits at display-pos i+1 → insert after
          return currentSlot > i ? i : i + 1
        }
      }

      // Cursor below all cards → append at end
      if (clientY > Math.max(...nonDragged.map(r => r.bottom))) return nonDragged.length

      // In a gap → keep current slot position
      return null
    }

    function runAutoScroll() {
      const THRESHOLD = 120
      const MAX_SPEED = 18
      const viewH = window.innerHeight
      let speed = 0

      if (currentClientY < THRESHOLD) {
        speed = -MAX_SPEED * (1 - currentClientY / THRESHOLD)
      } else if (currentClientY > viewH - THRESHOLD) {
        speed = MAX_SPEED * (1 - (viewH - currentClientY) / THRESHOLD)
      }

      if (speed !== 0) {
        window.scrollBy(0, speed)
        // Re-capture rects after scroll so calcReorderInsertIdx stays accurate
        if (reorderDragIdRef.current) {
          const map = new Map<string, DOMRect>()
          document.querySelectorAll<HTMLElement>('[data-bookmark-id]').forEach(el => {
            map.set(el.dataset.bookmarkId!, el.getBoundingClientRect())
          })
          capturedRectsRef.current = map
          const newIdx = calcReorderInsertIdx(currentClientX, currentClientY)
          if (newIdx !== null && newIdx !== reorderInsertIdxRef.current) {
            reorderInsertIdxRef.current = newIdx
            setReorderInsertIdx(newIdx)
          }
        }
      }

      scrollRafId = requestAnimationFrame(runAutoScroll)
    }

    scrollRafId = requestAnimationFrame(runAutoScroll)

    function onMove(e: MouseEvent) {
      currentClientX = e.clientX
      currentClientY = e.clientY
      const updated = { ...dragRef.current!, x: e.clientX, y: e.clientY }
      dragRef.current = updated
      setDrag(updated)
      if (reorderDragIdRef.current) {
        const newIdx = calcReorderInsertIdx(e.clientX, e.clientY)
        if (newIdx !== null && newIdx !== reorderInsertIdxRef.current) {
          reorderInsertIdxRef.current = newIdx
          setReorderInsertIdx(newIdx)
        }
      }
    }

    function onUp(_e: MouseEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (scrollRafId !== null) {
        cancelAnimationFrame(scrollRafId)
        scrollRafId = null
      }
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

        // Extract only same-parent siblings for Chrome sync (base list may contain cross-folder items)
        const isSameParent = (b: BookmarkNode) =>
          b.id === drId || bookmarkParentMap.get(b.id) === reorderParentId
        const newSiblingOrder = newOrder.filter(isSameParent)
        const origSiblingOrder = origList.filter(isSameParent)
        const origIds = origSiblingOrder.map(b => b.id).join(',')
        const newIds = newSiblingOrder.map(b => b.id).join(',')
        if (origIds !== newIds) {
          syncReorderedBookmark(drId, newSiblingOrder, reorderParentId).then(() => loadTree())
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function doMove(bookmarkId: string, folderId: string, folderTitle: string) {
    setExitingId(bookmarkId)
    setTimeout(async () => {
      await chrome.bookmarks.move(bookmarkId, { parentId: folderId, index: 0 })
      setExitingId(null)
      await loadTree()
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setMoveToast(t('movedToFolder', { folder: folderTitle }))
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

  const uncategorizedBookmarks = useMemo(() => getUncategorizedBookmarks(bookmarkTree), [bookmarkTree])

  const currentViewFolderId = subFolderNavStack.at(-1) ?? selectedFolderId

  const subFolders = useMemo(() => {
    if (!currentViewFolderId) return []
    const folder = findNodeById(currentViewFolderId, bookmarkTree)
    if (!folder) return []
    return (folder.children ?? []).filter(n => !n.url)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentViewFolderId, bookmarkTree])

  const displayedBookmarks = useMemo(() => {
    if (searchQuery.trim()) return searchBookmarks(searchQuery, bookmarkTree)
    if (showRecentlyUsed) return recentlyUsedBookmarks
    if (selectedFolderId === UNCATEGORIZED_ID) return uncategorizedBookmarks
    if (selectedFolderId) {
      const folder = findNodeById(currentViewFolderId!, bookmarkTree)
      return folder ? getAllBookmarksInFolder(folder) : []
    }
    return getRecentBookmarks(bookmarkTree, recentMonths)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, bookmarkTree, selectedFolderId, currentViewFolderId, recentMonths, showRecentlyUsed, recentlyUsedBookmarks, uncategorizedBookmarks])

  const sectionTitle = useMemo(() => {
    if (searchQuery.trim()) return t('searchResultTitle', { query: searchQuery })
    if (showRecentlyUsed) return t('recentlyUsedTitle')
    if (selectedFolderId === UNCATEGORIZED_ID) return t('uncategorizedTitle')
    if (!selectedFolderId) return t('recentAddedTitle')
    return null
  }, [searchQuery, selectedFolderId, showRecentlyUsed])

  const breadcrumbParts = useMemo(() => {
    if (!selectedFolderId) return []
    const parts: { id: string; title: string }[] = []
    const root = findNodeById(selectedFolderId, bookmarkTree)
    if (root) parts.push({ id: selectedFolderId, title: root.title })
    for (const id of subFolderNavStack) {
      const node = findNodeById(id, bookmarkTree)
      if (node) parts.push({ id, title: node.title })
    }
    return parts
  }, [selectedFolderId, subFolderNavStack, bookmarkTree])

  const isBaseRecentView = !searchQuery.trim() && !selectedFolderId
  const isRecentView = isBaseRecentView && !showRecentlyUsed

  const folderOptions = useMemo(() => getAllFolders(bookmarkTree), [bookmarkTree])

  const bookmarksWithFolder = useMemo(() =>
    displayedBookmarks.map(b => ({
      ...b,
      folderName: getBookmarkPath(b.id, bookmarkTree),
    })),
    [displayedBookmarks, bookmarkTree]
  )

  async function handleOrganize(prefs: OrganizePrefs) {
    setOrganizeStatus('loading')
    setOrganizeProgress({ done: 0, total: 0 })
    const result = await previewOrganize((p) => setOrganizeProgress(p), prefs)
    if (result.status === 'success' && result.items) {
      setOrganizePreview(result.items)
      setOrganizeStatus('idle')
    } else {
      setOrganizeStatus(result.status)
    }
  }

  async function handleConfirmOrganize() {
    if (!organizePreview) return
    const items = organizePreview
    setOrganizePreview(null)
    setOrganizeStatus('loading')
    setOrganizeProgress({ done: 0, total: items.length })
    const result = await applyOrganize(items, (p) => setOrganizeProgress(p))
    setOrganizeStatus(result.status)
    if (result.status === 'success') await loadTree()
  }

  return (
    <div className={`app${drag ? ' app--dragging' : ''}${pillDraggingId ? ' app--pill-dragging' : ''}${subTabDraggingId ? ' app--subtab-dragging' : ''}`}>
      {moveToast && (
        <div className="move-toast">{moveToast}</div>
      )}

      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="ctx-menu-item"
            onClick={() => {
              setRenameTarget({ id: contextMenu.id, title: contextMenu.title })
              setRenameValue(contextMenu.title)
              setContextMenu(null)
            }}
          >
            {t('ctxMenuRename')}
          </button>
          <button
            className="ctx-menu-item ctx-menu-item--danger"
            onClick={() => {
              if (contextMenu.type === 'pill') {
                setDeleteFolderTarget({ id: contextMenu.id, title: contextMenu.title })
              } else {
                setDeleteSubFolderTarget({ id: contextMenu.id, title: contextMenu.title })
              }
              setContextMenu(null)
            }}
          >
            {t('deleteBtn')}
          </button>
        </div>
      )}

      {drag && (
        <div
          className="drag-ghost"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          {drag.title || t('dragGhostFallback')}
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

      {subTabGhost && (
        <div
          className="subfolder-drag-ghost"
          style={{ left: subTabGhost.x, top: subTabGhost.y }}
        >
          {subTabGhost.title}
        </div>
      )}

      <div className="brand">
        <img className="brand-icon" src="/icons/icon48.png" alt="" />
        <span className="brand-name">Tabula</span>
      </div>

      <div className="bg-switcher" ref={bgPanelRef}>
        <button
          className={`bg-switcher-btn${bgPanelOpen ? ' open' : ''}`}
          onClick={() => setBgPanelOpen(o => !o)}
          title={t('bgSwitcherTitle')}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="16" height="16" rx="2.5"/>
            <polyline points="2 13.5 6.5 9 10.5 12 13.5 9.5 18 13.5"/>
            <circle cx="14" cy="6.5" r="1.5"/>
          </svg>
        </button>
        {bgPanelOpen && (
          <div className="bg-panel">
            {/* ── 预设背景 ── */}
            <div className="bg-panel-title">{t('bgPresetSection')}</div>
            <div className="bg-options">
              {BG_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`bg-option ${opt.cls}${bg === opt.id ? ' active' : ''}`}
                  onClick={() => { setBg(opt.id); setBgPanelOpen(false) }}
                >
                  <div className="bg-option-overlay" />
                  <span className="bg-option-label">{t(opt.labelKey)}</span>
                  {bg === opt.id && <span className="bg-option-check">✓</span>}
                </button>
              ))}
            </div>

            {/* ── 自定义背景 ── */}
            <div className="bg-panel-section">
              <span className="bg-panel-section-label">{t('bgCustomSection')}</span>
              <button
                className="bg-panel-upload-btn"
                onClick={() => customBgInputRef.current?.click()}
                title={t('bgUploadTitle')}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                </svg>
                {t('bgUploadBtn')}
              </button>
            </div>
            <input
              ref={customBgInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleCustomBgUpload}
            />
            {customBgs.length > 0 ? (
              <div className="bg-options">
                {customBgs.map((item, idx) => (
                  <button
                    key={item.id}
                    className={`bg-option bg-option-custom has-image${bg === `custom:${item.id}` ? ' active' : ''}`}
                    style={{ backgroundImage: `url("${item.dataUrl}")` }}
                    onClick={() => { setBg(`custom:${item.id}`); setBgPanelOpen(false) }}
                    title={t('bgCustomItemTitle', { n: idx + 1 })}
                  >
                    <div className="bg-option-overlay" />
                    <span className="bg-option-label">{t('bgCustomItemLabel', { n: idx + 1 })}</span>
                    {bg === `custom:${item.id}` && <span className="bg-option-check">✓</span>}
                    <button
                      className="bg-option-delete-btn"
                      onClick={(e) => handleDeleteCustomBg(e, item.id)}
                      title={t('bgDeleteTitle')}
                    >
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
                      </svg>
                    </button>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-custom-empty">
                {t('bgCustomEmpty')}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="app-header">
      <div className="search-wrapper">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              if (e.target.value.trim()) { setShowRecentlyUsed(false) }
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
          onClick={() => { setSelectedFolderId(null); setSearchQuery(''); setShowRecentlyUsed(true) }}
        >
          {t('recentPill')}
        </button>
        {uncategorizedBookmarks.length > 0 && (
          <button
            className={`pill${selectedFolderId === UNCATEGORIZED_ID ? ' active' : ''}`}
            onClick={() => { setSelectedFolderId(UNCATEGORIZED_ID); setSearchQuery(''); setShowRecentlyUsed(false) }}
          >
            {t('uncategorizedPill')}
          </button>
        )}
        {sortedDisplayRoots.map((f) => (
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
              ].filter(Boolean).join(' ')}
              onMouseDown={(e) => {
                if (e.button !== 0 || drag) return
                const sx = e.clientX, sy = e.clientY
                function onMove(ev: MouseEvent) {
                  if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                    pillDragActiveRef.current = true
                    startPillDragReorder(ev.clientX, ev.clientY, f.id, f.title, sortedDisplayRoots)
                  }
                }
                function onUp() {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                const x = Math.min(e.clientX, window.innerWidth - 140)
                const y = Math.min(e.clientY, window.innerHeight - 80)
                setContextMenu({ id: f.id, title: f.title, type: 'pill', x, y })
              }}
              onClick={() => {
                if (pillDragActiveRef.current) { pillDragActiveRef.current = false; return }
                if (!drag) { setSelectedFolderId(f.id); setSearchQuery(''); setShowRecentlyUsed(false) }
              }}
            >
              {f.title}
            </button>
          </div>
        ))}
        {!pillEditMode && (
          <button
            className="pill-add-btn"
            onClick={() => setShowAddFolderModal(true)}
            title={t('newFolderTooltip')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      <div className={`section-header${isBaseRecentView ? ' section-header--recent' : ''}`}>
        <h2 className="section-title">
          {isBaseRecentView ? (
            <div className="recent-toggle">
              <button
                className={`recent-toggle-btn${showRecentlyUsed ? ' active' : ''}`}
                onClick={() => setShowRecentlyUsed(true)}
              >
                {t('recentlyUsedTitle')}
              </button>
              <button
                className={`recent-toggle-btn${!showRecentlyUsed ? ' active' : ''}`}
                onClick={() => setShowRecentlyUsed(false)}
              >
                {t('recentAddedTitle')}
              </button>
            </div>
          ) : breadcrumbParts.length > 0 ? (
            <span className="breadcrumb-row">
              {breadcrumbParts.map((part, i) => (
                <span key={part.id} className="breadcrumb-item">
                  {i > 0 && <span className="breadcrumb-sep">›</span>}
                  {i < breadcrumbParts.length - 1 ? (
                    <button
                      className="breadcrumb-part"
                      onClick={() => setSubFolderNavStack(subFolderNavStack.slice(0, i))}
                    >
                      {part.title}
                    </button>
                  ) : (
                    <span className="breadcrumb-current">{part.title}</span>
                  )}
                </span>
              ))}
            </span>
          ) : sectionTitle}
        </h2>
        <span className="section-count">{t('bookmarkCount', { count: bookmarksWithFolder.length })}</span>
        {isBaseRecentView && (
          <div className="recent-dropdown" ref={showRecentlyUsed ? usedDropdownRef : dropdownRef}>
            <button
              className={`recent-dropdown-trigger${(showRecentlyUsed ? recentlyUsedOpen : recentOpen) ? ' open' : ''}`}
              onClick={() => showRecentlyUsed ? setRecentlyUsedOpen(o => !o) : setRecentOpen(o => !o)}
            >
              {t('recentMonths', { m: showRecentlyUsed ? recentlyUsedMonths : recentMonths })}
              <svg
                className={`recent-dropdown-chevron${(showRecentlyUsed ? recentlyUsedOpen : recentOpen) ? ' open' : ''}`}
                xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {(showRecentlyUsed ? recentlyUsedOpen : recentOpen) && (
              <div className="recent-dropdown-menu">
                {([1, 3] as const).map(m => (
                  <button
                    key={m}
                    className={`recent-dropdown-item${(showRecentlyUsed ? recentlyUsedMonths : recentMonths) === m ? ' selected' : ''}`}
                    onClick={() => {
                      if (showRecentlyUsed) { setRecentlyUsedMonths(m); setRecentlyUsedOpen(false) }
                      else { setRecentMonths(m); setRecentOpen(false) }
                    }}
                  >
                    {(showRecentlyUsed ? recentlyUsedMonths : recentMonths) === m && <span className="recent-dropdown-check">✓</span>}
                    {t('recentMonths', { m })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedFolderId && selectedFolderId !== UNCATEGORIZED_ID && !subFolderEditMode && (
          <button
            className="subfolder-tab-add-btn section-add-btn"
            onClick={() => setShowAddSubFolderModal(true)}
            title={t('addSubfolderTooltip')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {selectedFolderId && selectedFolderId !== UNCATEGORIZED_ID && (
        <div className="subfolder-tabs">
          {subFolders.map((f) => (
            <div
              key={f.id}
              className={[
                'subfolder-tab-wrapper',
                subTabDraggingId === f.id ? 'subfolder-tab-wrapper--dragging' : '',
                subTabDraggingId === f.id && subTabDropGapIndex !== null ? 'subfolder-tab-wrapper--collapsed' : '',
                (() => {
                  if (subTabDropGapIndex === null || subTabDraggingId === f.id) return ''
                  const nd = subFolders.filter(sf => sf.id !== subTabDraggingId)
                  const ndIdx = nd.findIndex(sf => sf.id === f.id)
                  if (ndIdx < 0) return ''
                  if (subTabDropGapIndex === ndIdx) return 'subfolder-tab-wrapper--gap-before'
                  if (subTabDropGapIndex === ndIdx + 1) return 'subfolder-tab-wrapper--gap-after'
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
                  'subfolder-tab',
                  dropFolderId === f.id ? 'subfolder-tab--drop-active' : '',
                ].filter(Boolean).join(' ')}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  const sx = e.clientX, sy = e.clientY
                  function onMove(ev: MouseEvent) {
                    if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                      subTabDragActiveRef.current = true
                      startSubTabDragReorder(ev.clientX, ev.clientY, f.id, f.title, subFolders)
                    }
                  }
                  function onUp() {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  const x = Math.min(e.clientX, window.innerWidth - 140)
                  const y = Math.min(e.clientY, window.innerHeight - 80)
                  setContextMenu({ id: f.id, title: f.title, type: 'subtab', x, y })
                }}
                onClick={() => {
                  if (subTabDragActiveRef.current) { subTabDragActiveRef.current = false; return }
                  setSubFolderNavStack(s => [...s, f.id])
                }}
              >
                {f.title}
              </button>
            </div>
          ))}
        </div>
      )}
      </div>{/* end app-header */}

      <div className={`app-scroll${scrolled ? ' app-scroll--scrolled' : ''}`} ref={scrollRef}>
      <div className="card-grid">
        {reorderDragId && reorderBaseList ? (
          // Reorder mode: only show direct-sibling bookmarks with a drop slot
          (() => {
            const nonDragged = reorderBaseList
              .filter(b => b.id !== reorderDragId)
              .map(b => ({
                ...b,
                folderName: getBookmarkPath(b.id, bookmarkTree),
              }))
            // Drop slot is only valid within the same-folder block
            const sameIdxs = nonDragged
              .map((b, i) => bookmarkParentMap.get(b.id) === reorderParentIdRef.current ? i : -1)
              .filter(i => i >= 0)
            const firstSame = sameIdxs.length > 0 ? sameIdxs[0] : -1
            const lastSame  = sameIdxs.length > 0 ? sameIdxs[sameIdxs.length - 1] : -1
            const slotVisible = (idx: number) =>
              firstSame >= 0 && idx >= firstSame && idx <= lastSame + 1
            const els: React.ReactNode[] = []
            nonDragged.forEach((b, i) => {
              if (reorderInsertIdx === i && slotVisible(i)) els.push(<div key="drop-slot" className="card-drop-slot" />)
              els.push(
                <BookmarkCard
                  key={b.id}
                  bookmark={b}
                  folders={folderOptions}
                  tree={bookmarkTree}
                  onUpdated={loadTree}
                  onLongPress={(pos) => startDrag(b.id, b.title, pos)}
                  isDragging={false}
                  isExiting={exitingId === b.id}
                  isDimmed={bookmarkParentMap.get(b.id) !== reorderParentIdRef.current}
                />
              )
            })
            if (reorderInsertIdx === nonDragged.length && slotVisible(nonDragged.length)) els.push(<div key="drop-slot" className="card-drop-slot" />)
            return els
          })()
        ) : bookmarksWithFolder.length === 0 ? (
          <div className="empty-state">
            {searchQuery.trim() ? t('noMatchBookmarks') : t('noBookmarks')}
          </div>
        ) : (
          bookmarksWithFolder.map(b => (
            <BookmarkCard
              key={b.id}
              bookmark={b}
              folders={folderOptions}
              tree={bookmarkTree}
              onUpdated={loadTree}
              onLongPress={(isRecentView || showRecentlyUsed) ? undefined : (pos) => startDrag(b.id, b.title, pos)}
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
      </div>{/* end app-scroll */}

      <OrganizeFAB
        status={organizeStatus}
        progress={organizeProgress}
        onOrganize={handleOrganize}
      />

      {showAddFolderModal && (
        <div className="modal-overlay" onClick={() => { setShowAddFolderModal(false); setNewFolderName('') }}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalNewFolder')}</h3>
              <button className="modal-close" onClick={() => { setShowAddFolderModal(false); setNewFolderName('') }}>×</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">{t('folderNameLabel')}</label>
              <input
                className="modal-input"
                type="text"
                placeholder={t('folderNamePlaceholder')}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddFolder() }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => { setShowAddFolderModal(false); setNewFolderName('') }}>{t('cancelBtn')}</button>
              <button className="modal-btn save" onClick={handleAddFolder} disabled={!newFolderName.trim()}>{t('createBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {deleteFolderTarget && (
        <div className="modal-overlay" onClick={() => setDeleteFolderTarget(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalDeleteFolder')}</h3>
              <button className="modal-close" onClick={() => setDeleteFolderTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="delete-confirm-text">
                {t('deleteFolderConfirm', { name: deleteFolderTarget.title })}
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setDeleteFolderTarget(null)}>{t('cancelBtn')}</button>
              <button className="modal-btn danger" onClick={handleDeleteFolder}>{t('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {showAddSubFolderModal && (
        <div className="modal-overlay" onClick={() => { setShowAddSubFolderModal(false); setNewSubFolderName('') }}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalNewSubFolder')}</h3>
              <button className="modal-close" onClick={() => { setShowAddSubFolderModal(false); setNewSubFolderName('') }}>×</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">{t('folderNameLabel')}</label>
              <input
                className="modal-input"
                type="text"
                placeholder={t('folderNamePlaceholder')}
                value={newSubFolderName}
                onChange={e => setNewSubFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubFolder() }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => { setShowAddSubFolderModal(false); setNewSubFolderName('') }}>{t('cancelBtn')}</button>
              <button className="modal-btn save" onClick={handleAddSubFolder} disabled={!newSubFolderName.trim()}>{t('createBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {deleteSubFolderTarget && (
        <div className="modal-overlay" onClick={() => setDeleteSubFolderTarget(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalDeleteSubFolder')}</h3>
              <button className="modal-close" onClick={() => setDeleteSubFolderTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="delete-confirm-text">
                {t('deleteFolderConfirm', { name: deleteSubFolderTarget.title })}
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setDeleteSubFolderTarget(null)}>{t('cancelBtn')}</button>
              <button className="modal-btn danger" onClick={handleDeleteSubFolder}>{t('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="modal-overlay" onClick={() => { setRenameTarget(null); setRenameValue('') }}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('modalRenameFolder')}</h3>
              <button className="modal-close" onClick={() => { setRenameTarget(null); setRenameValue('') }}>×</button>
            </div>
            <div className="modal-body">
              <label className="modal-label">{t('folderNameLabel')}</label>
              <input
                className="modal-input"
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder() }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => { setRenameTarget(null); setRenameValue('') }}>{t('cancelBtn')}</button>
              <button
                className="modal-btn save"
                onClick={handleRenameFolder}
                disabled={!renameValue.trim() || renameValue.trim() === renameTarget.title}
              >{t('saveBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {organizePreview && (
        <div className="modal-overlay" onClick={() => setOrganizePreview(null)}>
          <div className="modal-dialog modal-dialog--wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('organizePreviewTitle')}</h3>
              <button className="modal-close" onClick={() => setOrganizePreview(null)}>×</button>
            </div>
            <div className="modal-body organize-preview-body">
              <p className="organize-preview-count">{t('organizePreviewCount', { count: organizePreview.length })}</p>
              <div className="organize-preview-list">
                {organizePreview.map(item => (
                  <div key={item.bookmarkId} className="organize-preview-item">
                    <span className="organize-preview-title">{item.title}</span>
                    <span className="organize-preview-arrow">→</span>
                    <span className="organize-preview-folder">{item.targetFolder}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setOrganizePreview(null)}>{t('cancelBtn')}</button>
              <button className="modal-btn save" onClick={handleConfirmOrganize}>{t('organizePreviewApply')}</button>
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
    targetIdx = prevPos + 1
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

function getBookmarksBarId(tree: BookmarkNode[]): string {
  for (const root of tree) {
    for (const child of root.children ?? []) {
      if (child.id === '1' || child.title === 'Bookmarks bar' || child.title === '书签栏') {
        return child.id
      }
    }
  }
  return '1'
}
