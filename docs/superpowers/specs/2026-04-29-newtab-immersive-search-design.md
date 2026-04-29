# 新标签页沉浸式搜索中心 Design Spec

**日期：** 2026-04-29
**状态：** 已批准，待实施

---

## 目标

将新标签页布局从「侧边栏 + 列表」改为「沉浸式搜索中心」：暗色渐变背景，搜索框居中为核心，分类标签横排筛选，书签以卡片网格展示，AI 整理入口下沉为右下角 FAB 按钮。

---

## 方案

采用**整体替换**方案：完全重写 `src/newtab/App.tsx` 和 `index.css`，删除不再使用的 `FolderTree.tsx` 和 `BookmarkList.tsx`，新建 `BookmarkCard.tsx` 和 `OrganizeFAB.tsx`，在 `utils.ts` 补充两个纯函数。共享 lib（`organize.ts`、`bookmarks.ts`、`classifier.ts`）不变。

---

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/newtab/utils.ts` | 修改 | 新增 `getRecentBookmarks`、`getAllBookmarksInFolder`；`BookmarkNode` 补充 `dateAdded?: number` |
| `src/newtab/utils.test.ts` | 修改 | 补充上述两函数的单元测试 |
| `src/newtab/App.tsx` | 重写 | 沉浸式布局、全局状态管理 |
| `src/newtab/index.css` | 重写 | 暗色主题、卡片样式、FAB 样式 |
| `src/newtab/components/BookmarkCard.tsx` | 新建 | 书签卡片组件 |
| `src/newtab/components/OrganizeFAB.tsx` | 新建 | 右下角悬浮整理按钮 |
| `src/newtab/components/FolderTree.tsx` | 删除 | 不再使用 |
| `src/newtab/components/BookmarkList.tsx` | 删除 | 不再使用 |

---

## 视觉布局

```
┌─────────────────────────────────────────────┐
│  (暗色渐变背景 #0a0a0f → #12071e → #0a0f1a) │
│                                             │
│              🔖 Smart Bookmark              │
│                                             │
│         ┌──────────────────────┐            │
│         │  🔍  搜索书签…        │            │
│         └──────────────────────┘            │
│                                             │
│   [全部]  [前端开发]  [工作]  [学习]  [工具]   │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ favicon  │ │ favicon  │ │ favicon  │   │
│  │ 标题     │ │ 标题     │ │ 标题     │   │
│  │ 域名     │ │ 域名     │ │ 域名     │   │
│  │ [文件夹] │ │ [文件夹] │ │ [文件夹] │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│                              ✨ [FAB]        │
└─────────────────────────────────────────────┘
```

**视觉细节：**
- 背景：`linear-gradient(135deg, #0a0a0f, #12071e, #0a0f1a)` 全屏固定
- 搜索框：宽 600px，半透明白色背景 `rgba(255,255,255,0.08)`，聚焦时紫色发光边框
- 分类 pill：选中态紫色 `#a855f7` 高亮；默认态 `rgba(255,255,255,0.08)`
- 卡片：`rgba(255,255,255,0.04)` 背景，hover 时微亮 + 紫色阴影光晕
- 文件夹标签（卡片内）：彩色小圆点 + 文件夹名，颜色按 folder id hash 自动分配
- FAB：紫色渐变圆形按钮（56px），loading 时显示 `done/total` 进度

---

## 数据流

```
挂载 → chrome.bookmarks.getTree() → bookmarkTree
  ├─ getDisplayRoots(tree) → 分类标签 pills
  ├─ 默认态（无搜索词、无选中分类）
  │    └─ getRecentBookmarks(tree, 20) → 最近 20 条书签
  ├─ 搜索词非空
  │    └─ searchBookmarks(query, tree)
  └─ 选中分类 folderId
       └─ findNodeById(folderId, tree) → getAllBookmarksInFolder(node)
```

---

## 组件设计

### App.tsx

**状态：**
```ts
bookmarkTree: BookmarkNode[]
selectedFolderId: string | null   // null = 显示最近
searchQuery: string
organizeStatus: OrganizeStatus
organizeProgress: OrganizeProgress
```

**Memos：**
- `displayRoots` → 分类标签来源
- `displayedBookmarks` → 三路分支逻辑（搜索 / 分类 / 最近）
- `sectionTitle` → "最近添加" | `搜索"${query}"` | 文件夹名

**每个书签附加 `folderName`** 字段（通过辅助函数 `findFolderName(bookmarkId, tree)` 查找父节点标题），传给 `BookmarkCard`。

### BookmarkCard.tsx

**Props：** `{ bookmark: BookmarkNode & { folderName?: string } }`

- favicon：`chrome://favicon2/?size=32&page_url=${encodeURIComponent(url)}`，onError 回退占位符
- 域名：`new URL(url).hostname`（try/catch 兜底显示 url 原文）
- 文件夹标签：彩色圆点 + folderName（颜色 = `PALETTE[hashCode(folderName) % PALETTE.length]`）
- 点击：`window.open(url, '_blank')`（不离开新标签页）

### OrganizeFAB.tsx

**Props：** `{ status: OrganizeStatus, progress: OrganizeProgress, onOrganize: () => void }`

- `idle`：紫色渐变圆形按钮，图标 ✨
- `loading`：显示 `done/total`，禁用点击
- `success / error / no-key`：按钮旁弹出小 toast，3 秒后自动消失（`setTimeout` + 回调 `onDismiss`）

---

## utils.ts 新增函数

### `getRecentBookmarks(tree: BookmarkNode[], limit: number): BookmarkNode[]`

- 递归遍历整棵树，收集所有叶节点（有 `url`）
- 按 `dateAdded` 降序排列（undefined 视为 0）
- 返回前 `limit` 条

### `getAllBookmarksInFolder(node: BookmarkNode): BookmarkNode[]`

- 递归收集 `node` 及所有子文件夹中的所有书签（有 `url`）
- 返回扁平数组

### `BookmarkNode` 接口补充

```ts
export interface BookmarkNode {
  id: string
  title: string
  url?: string
  children?: BookmarkNode[]
  dateAdded?: number   // 新增
}
```

---

## 不在范围内

- 拖拽移动书签（已确认去掉）
- 书签的增删改（只读浏览）
- 多选、批量操作
- 深色/浅色模式切换
