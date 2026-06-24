# Tabula

English | [中文](./README.zh-CN.md)

> A Chrome extension that replaces your new tab page with an AI-powered bookmark manager — save, classify, and organize bookmarks effortlessly.

![Tabula](./docs/banner.png)

## Features

- **Smart New Tab** — Your bookmarks are always one tab away, organized in folders with instant search
- **AI Auto-Classify** — Press `Alt+Shift+S` to save the current page; AI picks the right folder automatically
- **One-Click Organize** — Batch re-classify your existing bookmarks with customizable granularity and naming rules
- **Recently Used** — Toggle a "Recently Used" view in the section header to quickly access bookmarks you've opened recently
- **Background Switcher** — Choose from 13 curated nature photo presets or upload your own custom backgrounds; manage them in a gallery with individual delete support
- **Drag to Reorder** — Drag and drop bookmarks within a folder to arrange them exactly how you like
- **Enhanced Bookmark Edit** — Edit a bookmark's URL, title, and folder all in one place; browse the full folder tree in a sub-page that auto-scrolls to the current location
- **Local Favicon Cache** — Website icons are cached locally for instant display; falls back to a styled initial letter when a favicon is unavailable
- **New Bookmarks at Top** — Newly saved bookmarks appear at the top of their folder so they're always easy to find
- **Open in Tab Group** — Right-click a bookmark and open it in the tab group matching its parent folder, created automatically if needed
- **Import Tab Groups** — Save your tab groups as bookmark folders in one click; each group becomes a same-named folder with its tabs as bookmarks, scoped to the current window or all windows
- **Multi-Provider AI** — Bring your own API key; supports 7 mainstream AI providers
- **Multi-Language UI** — English, Simplified Chinese, Traditional Chinese

## Supported AI Providers

| Provider | Models |
|----------|--------|
| [Claude](https://console.anthropic.com) | Haiku 4.5 / Sonnet 4.6 / Opus 4.7 |
| [DeepSeek](https://platform.deepseek.com) | V4 Pro / V4 Flash / V3 / R1 |
| [Gemini](https://aistudio.google.com/app/apikey) | 2.0 Flash / 1.5 Flash / 1.5 Pro |
| [通义千问](https://dashscope.console.aliyun.com) | Turbo / Plus / Max |
| [Kimi](https://platform.moonshot.cn) | Moonshot 8k / 32k / 128k |
| [智谱 GLM](https://open.bigmodel.cn) | GLM-4 Flash (free) / GLM-4 Plus / GLM-4 |
| [MiniMax](https://platform.minimaxi.com) | Text-01 / ABAB 6.5s |

## Getting Started

1. Open the extension settings (click the icon → ⚙ Settings)
2. Add an API key for any supported AI provider
3. Open a new tab — your bookmarks will appear
4. Press `Alt+Shift+S` on any webpage to save and auto-classify it

## Permissions

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read and write bookmark data for display and classification |
| `tabs` | Get current tab URL and title when saving via shortcut |
| `tabGroups` | Open a bookmark in the tab group matching its parent folder, creating the group if it doesn't exist |
| `contextMenus` | Add an "Open in tab group" right-click menu item to bookmark cards on the new tab page |
| `activeTab` | Detect the active tab to trigger save-and-classify and show toast notifications |
| `storage` | Persist user settings (API keys, provider, preferences) and favicon cache |
| `scripting` | Inject loading/success/error toast notifications into the active tab |
| `history` | Query browsing history to identify recently visited bookmarks for the "Recently Used" view |
| `host_permissions` | Fetch website favicons for display in the bookmark list |

