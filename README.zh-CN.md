# Smart Bookmark

[English](./README.md) | 中文

> 将新标签页变成 AI 驱动的书签管理器 —— 智能收藏、自动分类、一键整理。

![Smart Bookmark](./docs/banner.png)

## 功能特性

- **智能新标签页** — 打开新标签页即可看到分类整理的书签，支持即时搜索
- **快捷键 AI 收藏** — 按下 `Alt+Shift+S` 保存当前页面，AI 自动选择合适的文件夹
- **一键整理书签** — 批量对已有书签进行 AI 重新分类，支持自定义粒度和命名规则
- **书签备份还原** — 随时保存书签快照，误操作后一键恢复
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

## 安装方式

### Chrome 网上应用店

*（即将上线）*

### 开发者模式本地加载

1. 克隆仓库并安装依赖：
   ```bash
   git clone https://github.com/hepiao3/smart-bookmark.git
   cd smart-bookmark
   npm install
   ```

2. 构建扩展：
   ```bash
   npm run build
   ```

3. 打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择 `dist/` 目录。

## 快速上手

1. 点击扩展图标 → ⚙ 设置，添加任意一家 AI 提供商的 API Key
2. 打开新标签页，书签将以分类方式展示
3. 在任意网页按下 `Alt+Shift+S`，即可保存当前页面并自动分类
4. 点击新标签页右下角的整理按钮，可对全部书签进行批量重新分类

## 开发

```bash
npm install       # 安装依赖
npm run dev       # 启动开发服务器（支持热更新）
npm run build     # 生产环境构建 → dist/
npm run test      # 运行单元测试
npm run lint      # 代码检查
```

项目使用 [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin) 实现 Chrome 扩展开发时的热更新。

## 权限说明

| 权限 | 用途 |
|------|------|
| `bookmarks` | 读写书签数据，用于展示和智能分类 |
| `tabs` | 获取当前标签页的 URL 和标题，用于快捷键收藏 |
| `activeTab` | 检测活跃标签页，触发收藏分类并显示 Toast 提示 |
| `storage` | 持久化用户设置（API Key、提供商偏好）和书签快照 |
| `scripting` | 在当前页面注入加载中/成功/失败的 Toast 通知 |
| `host_permissions` | 获取网站 Favicon，用于书签列表中的图标展示 |

## 技术栈

- **React 19** + **TypeScript**
- **Vite** + **CRXJS**（Chrome 扩展构建）
- **Zustand**（状态管理）
- **@anthropic-ai/sdk** + **openai**（AI 提供商客户端）
- Chrome Extension **Manifest V3**
