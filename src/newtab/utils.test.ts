import { describe, it, expect } from 'vitest'
import { getDisplayRoots, getAllFolderIds, searchBookmarks, findNodeById } from './utils'
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
