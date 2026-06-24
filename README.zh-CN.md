# Tabula

[English](./README.md) | 中文

> 将新标签页变成 AI 驱动的书签管理器 —— 智能收藏、自动分类、一键整理。

![Tabula](./docs/banner.png)

## 功能特性

- **智能新标签页** — 打开新标签页即可看到分类整理的书签，支持即时搜索
- **快捷键 AI 收藏** — 按下 `Alt+Shift+S` 保存当前页面，AI 自动选择合适的文件夹
- **一键整理书签** — 批量对已有书签进行 AI 重新分类，支持自定义粒度和命名规则
- **最近使用** — 在分区标题处切换"最近使用"视图，快速找到近期访问的书签
- **背景切换器** — 提供 13 张精选自然风光预设图片，支持上传多张自定义背景，可在画廊中单独管理和删除
- **拖拽排序** — 在文件夹内自由拖拽书签，按自己的习惯排列
- **增强编辑弹窗** — 在一个弹窗内编辑书签的 URL、标题和所在文件夹；文件夹选择使用独立子页面，自动定位到当前位置
- **本地 Favicon 缓存** — 网站图标本地缓存，加载更快；无图标时自动显示带样式的首字母占位
- **新书签置顶** — 新保存的书签插入文件夹顶部，随时可见
- **在标签页群组中打开** — 右键书签即可在与所在文件夹同名的标签分组中打开，分组不存在时自动创建
- **导入标签页分组** — 一键将标签页分组保存为书签文件夹，每个分组生成同名文件夹、组内标签页转为书签，可选当前窗口或所有窗口
- **多 AI 提供商** — 自带 API Key，支持 7 家主流 AI 服务商
- **多语言界面** — 支持英文、简体中文、繁体中文

## 支持的 AI 提供商

| 提供商 | 可用模型 |
|--------|---------|
| [Claude](https://console.anthropic.com) | Haiku 4.5 / Sonnet 4.6 / Opus 4.7 |
| [DeepSeek](https://platform.deepseek.com) | V4 Pro / V4 Flash / V3 / R1 |
| [Gemini](https://aistudio.google.com/app/apikey) | 2.0 Flash / 1.5 Flash / 1.5 Pro |
| [通义千问](https://dashscope.console.aliyun.com) | Turbo / Plus / Max |
| [Kimi](https://platform.moonshot.cn) | Moonshot 8k / 32k / 128k |
| [智谱 GLM](https://open.bigmodel.cn) | GLM-4 Flash（免费）/ GLM-4 Plus / GLM-4 |
| [MiniMax](https://platform.minimaxi.com) | Text-01 / ABAB 6.5s |

## 快速上手

1. 点击扩展图标 → ⚙ 设置，添加任意一家 AI 提供商的 API Key
2. 打开新标签页，书签将以分类方式展示
3. 在任意网页按下 `Alt+Shift+S`，即可保存当前页面并自动分类
4. 点击新标签页右下角的整理按钮，可对全部书签进行批量重新分类

## 权限说明

| 权限 | 用途 |
|------|------|
| `bookmarks` | 读写书签数据，用于展示和智能分类 |
| `tabs` | 获取当前标签页的 URL 和标题，用于快捷键收藏 |
| `tabGroups` | 在与书签所在文件夹同名的标签分组中打开书签，分组不存在时自动创建 |
| `contextMenus` | 在新标签页的书签卡片上添加「在标签页群组中打开」右键菜单项 |
| `activeTab` | 检测活跃标签页，触发收藏分类并显示 Toast 提示 |
| `storage` | 持久化用户设置（API Key、提供商偏好）及 Favicon 缓存 |
| `scripting` | 在当前页面注入加载中/成功/失败的 Toast 通知 |
| `history` | 查询浏览历史，识别近期访问过的书签，用于"最近使用"视图 |
| `host_permissions` | 获取网站 Favicon，用于书签列表中的图标展示 |

