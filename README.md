# Smart Bookmark

English | [中文](./README.zh-CN.md)

> A Chrome extension that replaces your new tab page with an AI-powered bookmark manager — save, classify, and organize bookmarks effortlessly.

![Smart Bookmark](./docs/banner.png)

## Features

- **Smart New Tab** — Your bookmarks are always one tab away, organized in folders with instant search
- **AI Auto-Classify** — Press `Alt+Shift+S` to save the current page; AI picks the right folder automatically
- **One-Click Organize** — Batch re-classify your existing bookmarks with customizable granularity and naming rules
- **Bookmark Backup** — Save snapshots of your bookmarks and restore them at any time
- **Multi-Provider AI** — Bring your own API key; supports 7 AI providers
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

## Installation

### From Chrome Web Store

*(Coming soon)*

### Load Unpacked (Developer Mode)

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/hepiao3/smart-bookmark.git
   cd smart-bookmark
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

## Getting Started

1. Open the extension settings (click the icon → ⚙ Settings)
2. Add an API key for any supported AI provider
3. Open a new tab — your bookmarks will appear
4. Press `Alt+Shift+S` on any webpage to save and auto-classify it

## Development

```bash
npm install       # install dependencies
npm run dev       # start dev server (Vite HMR)
npm run build     # production build → dist/
npm run test      # run unit tests
npm run lint      # lint source files
```

The project uses [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin) for Chrome Extension hot-reload during development.

## Permissions

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read and write bookmark data for display and classification |
| `tabs` | Get current tab URL and title when saving via shortcut |
| `activeTab` | Detect the active tab to trigger save-and-classify and show toast notifications |
| `storage` | Persist user settings (API keys, provider, preferences) and bookmark snapshots |
| `scripting` | Inject loading/success/error toast notifications into the active tab |
| `host_permissions` | Fetch website favicons for display in the bookmark list |

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** + **CRXJS** (Chrome Extension build)
- **Zustand** (state management)
- **@anthropic-ai/sdk** + **openai** (AI provider clients)
- Chrome Extension **Manifest V3**
