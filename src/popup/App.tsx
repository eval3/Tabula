import { useState } from 'react'
import { getAllBookmarks, getAllFolders, getOrCreateFolder, moveBookmark } from '../lib/bookmarks'
import { classifyBookmarks } from '../lib/classifier'
import type { BookmarkItem } from '../lib/classifier'
import { PROVIDERS, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'

type Status = 'idle' | 'loading' | 'success' | 'error' | 'no-key'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState('')

  async function handleOrganizeAll() {
    const result = await chrome.storage.sync.get(['activeProvider', 'activeModel', 'apiKeys'])
    const providerId: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
    const apiKeys = (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {}
    const apiKey = apiKeys[providerId] ?? ''
    const model = (result.activeModel as string) ?? ''

    if (!apiKey || !model) {
      setStatus('no-key')
      return
    }

    const config = { providerId, apiKey, model }
    setStatus('loading')
    setProgress({ done: 0, total: 0 })

    try {
      const rawBookmarks = await getAllBookmarks()
      const folders = await getAllFolders()
      const folderNames = Object.keys(folders)

      const uncategorized: BookmarkItem[] = rawBookmarks.map(b => ({
        id: b.id,
        title: b.title ?? '',
        url: b.url ?? '',
      }))

      setProgress({ done: 0, total: uncategorized.length })

      // 切分批次，3 批并发
      const batchSize = 20
      const concurrency = 3
      const batches: BookmarkItem[][] = []
      for (let i = 0; i < uncategorized.length; i += batchSize) {
        batches.push(uncategorized.slice(i, i + batchSize))
      }

      for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency)
        const chunkResults = await Promise.all(
          chunk.map(batch => classifyBookmarks(config, batch, folderNames))
        )
        for (const results of chunkResults) {
          for (const r of results) {
            const folderId = await getOrCreateFolder(r.folderName)
            await moveBookmark(r.bookmarkId, folderId)
            setProgress(p => ({ ...p, done: p.done + 1 }))
          }
        }
      }

      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '未知错误')
      setStatus('error')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🔖</span>
        <h1 style={styles.title}>Smart Bookmark</h1>
      </div>

      <ActiveProviderBadge />

      {status === 'no-key' && (
        <div style={styles.warning}>请先在设置页配置 API Key 和模型</div>
      )}
      {status === 'error' && (
        <div style={styles.error}>整理失败：{errorMsg}</div>
      )}
      {status === 'success' && (
        <div style={styles.success}>整理完成！共处理 {progress.total} 个书签</div>
      )}
      {status === 'loading' && (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>正在整理... {progress.done} / {progress.total}</div>
          <div style={styles.progressBar}>
            <div style={{
              ...styles.progressFill,
              width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
            }} />
          </div>
        </div>
      )}

      <button
        style={{ ...styles.button, opacity: status === 'loading' ? 0.6 : 1 }}
        onClick={handleOrganizeAll}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? '整理中...' : '一键智能整理书签'}
      </button>

      <div style={styles.hint}>
        快捷键收藏当前页：<kbd style={styles.kbd}>Alt+Shift+S</kbd>
      </div>

      <button style={styles.settingsBtn} onClick={() => chrome.runtime.openOptionsPage()}>
        ⚙ 设置
      </button>
    </div>
  )
}

function ActiveProviderBadge() {
  const [label, setLabel] = useState('加载中...')

  useState(() => {
    chrome.storage.sync.get(['activeProvider', 'activeModel'], (result) => {
      const pid: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
      const provider = PROVIDERS[pid]
      const model = result.activeModel as string ?? ''
      const modelLabel = provider.models.find(m => m.id === model)?.label ?? model
      setLabel(`${provider.name} · ${modelLabel}`)
    })
  })

  return <div style={styles.badge}>{label}</div>
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { fontSize: 22 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a1a1a' },
  badge: {
    background: '#f0f0ff',
    color: '#4f46e5',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 500,
    alignSelf: 'flex-start',
  },
  button: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 0',
    fontSize: 14,
    fontWeight: 500,
    width: '100%',
    cursor: 'pointer',
  },
  hint: { fontSize: 11, color: '#888', textAlign: 'center' },
  kbd: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  settingsBtn: {
    background: 'none',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '6px 0',
    fontSize: 13,
    color: '#555',
    cursor: 'pointer',
    width: '100%',
  },
  warning: { background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '7px 10px', fontSize: 12 },
  error: { background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 10px', fontSize: 12 },
  success: { background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '7px 10px', fontSize: 12 },
  progressWrap: { display: 'flex', flexDirection: 'column', gap: 5 },
  progressText: { fontSize: 12, color: '#555' },
  progressBar: { height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#4f46e5', borderRadius: 99, transition: 'width 0.3s' },
}
