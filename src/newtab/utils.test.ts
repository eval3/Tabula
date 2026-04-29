import { describe, it, expect } from 'vitest'
import { getDisplayRoots, getAllFolderIds, searchBookmarks, findNodeById, getRecentBookmarks, getAllBookmarksInFolder } from './utils'
import type { BookmarkNode } from './utils'

const MOCK_TREE: BookmarkNode[] = [
  {
    id: '0', title: '',
    children: [
      {
        id: '1', title: 'Bookmarks bar',
        children: [
          {
            id: '10', title: '前端开发',
            children: [
              {
                id: '11', title: 'React',
                children: [{ id: '12', title: 'Hooks', children: [] }],
              },
              { id: '101', title: 'React 官方', url: 'https://react.dev' },
            ],
          },
          { id: '20', title: '后端', children: [] },
          { id: '102', title: 'Google', url: 'https://google.com' },
        ],
      },
    ],
  },
]

describe('getDisplayRoots', () => {
  it('跳过系统节点，返回可显示的顶层文件夹', () => {
    const roots = getDisplayRoots(MOCK_TREE)
    expect(roots.map(r => r.id)).toEqual(['10', '20'])
  })

  it('同时跳过 id 2 和 3 的系统节点', () => {
    const treeWithAllSystemIds: BookmarkNode[] = [
      { id: '0', title: '', children: [
        { id: '2', title: 'Other bookmarks', children: [
          { id: '30', title: '工作', children: [] },
        ]},
        { id: '3', title: 'Mobile bookmarks', children: [] },
      ]},
    ]
    const roots = getDisplayRoots(treeWithAllSystemIds)
    expect(roots.map(r => r.id)).toEqual(['30'])
  })
})

describe('getAllFolderIds', () => {
  it('递归返回所有文件夹 ID', () => {
    const roots = getDisplayRoots(MOCK_TREE)
    expect(getAllFolderIds(roots).sort()).toEqual(['10', '11', '12', '20'].sort())
  })
})

describe('searchBookmarks', () => {
  it('按标题关键词过滤（不区分大小写）', () => {
    const results = searchBookmarks('react', MOCK_TREE)
    expect(results.map(r => r.id)).toContain('101')
  })

  it('按 URL 关键词过滤', () => {
    const results = searchBookmarks('google.com', MOCK_TREE)
    expect(results.map(r => r.id)).toEqual(['102'])
  })

  it('空查询返回空数组', () => {
    expect(searchBookmarks('', MOCK_TREE)).toEqual([])
  })

  it('不返回文件夹节点，只返回书签', () => {
    const results = searchBookmarks('前端', MOCK_TREE)
    expect(results.every(r => !!r.url)).toBe(true)
  })
})

describe('findNodeById', () => {
  it('深度查找嵌套节点', () => {
    expect(findNodeById('12', MOCK_TREE)?.title).toBe('Hooks')
  })

  it('找不到时返回 null', () => {
    expect(findNodeById('999', MOCK_TREE)).toBeNull()
  })
})

describe('getRecentBookmarks', () => {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  it('返回最近30天内的书签，按 dateAdded 降序', () => {
    const tree: BookmarkNode[] = [
      { id: '0', title: '', children: [
        { id: 'a', title: 'Old', url: 'https://old.com', dateAdded: now - 35 * dayMs },
        { id: 'b', title: 'New', url: 'https://new.com', dateAdded: now - 5 * dayMs },
        { id: 'c', title: 'Mid', url: 'https://mid.com', dateAdded: now - 15 * dayMs },
      ]},
    ]
    const results = getRecentBookmarks(tree, 1)
    expect(results.map(r => r.id)).toEqual(['b', 'c'])
  })

  it('支持自定义月数范围', () => {
    const tree: BookmarkNode[] = [
      { id: '0', title: '', children: [
        { id: 'a', title: 'VeryOld', url: 'https://old.com', dateAdded: now - 95 * dayMs },
        { id: 'b', title: 'Old', url: 'https://a.com', dateAdded: now - 35 * dayMs },
        { id: 'c', title: 'New', url: 'https://b.com', dateAdded: now - 5 * dayMs },
      ]},
    ]
    const r1 = getRecentBookmarks(tree, 1)
    expect(r1.map(r => r.id)).toEqual(['c'])

    const r3 = getRecentBookmarks(tree, 3)
    expect(r3.map(r => r.id)).toEqual(['c', 'b'])
  })

  it('dateAdded 缺失时视为最近，包含在结果中', () => {
    const tree: BookmarkNode[] = [
      { id: '0', title: '', children: [
        { id: 'a', title: 'A', url: 'https://a.com', dateAdded: now - 5 * dayMs },
        { id: 'b', title: 'B', url: 'https://b.com' },
      ]},
    ]
    const results = getRecentBookmarks(tree)
    expect(results.map(r => r.id).sort()).toEqual(['a', 'b'].sort())
  })

  it('不返回文件夹节点', () => {
    const tree: BookmarkNode[] = [
      { id: '0', title: '', children: [
        { id: 'f', title: 'Folder', children: [] },
        { id: 'a', title: 'A', url: 'https://a.com', dateAdded: now - 2 * dayMs },
      ]},
    ]
    expect(getRecentBookmarks(tree).length).toBe(1)
  })
})

describe('getAllBookmarksInFolder', () => {
  it('递归收集文件夹内所有书签', () => {
    const folder: BookmarkNode = {
      id: '10', title: '前端开发', children: [
        { id: '101', title: 'React', url: 'https://react.dev' },
        { id: '11', title: 'React', children: [
          { id: '111', title: 'Hooks', url: 'https://react.dev/hooks' },
        ]},
      ],
    }
    const results = getAllBookmarksInFolder(folder)
    expect(results.map(r => r.id).sort()).toEqual(['101', '111'].sort())
  })

  it('空文件夹返回空数组', () => {
    expect(getAllBookmarksInFolder({ id: 'x', title: 'Empty', children: [] })).toEqual([])
  })

  it('只有文件夹本身没有书签时返回空数组', () => {
    expect(getAllBookmarksInFolder({ id: 'x', title: 'Empty' })).toEqual([])
  })
})
