import { useState, useEffect } from 'react'
import { PROVIDER_LIST, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'

interface StorageData {
  activeProvider: ProviderId
  activeModel: string
  autoClassify: boolean
  apiKeys: Partial<Record<ProviderId, string>>
}

const DEFAULT_DATA: StorageData = {
  activeProvider: DEFAULT_PROVIDER,
  activeModel: 'deepseek-v4-pro',
  autoClassify: true,
  apiKeys: {},
}

export default function OptionsApp() {
  const [data, setData] = useState<StorageData>(DEFAULT_DATA)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<ProviderId>(DEFAULT_PROVIDER)

  useEffect(() => {
    chrome.storage.sync.get(
      ['activeProvider', 'activeModel', 'autoClassify', 'apiKeys'],
      (result) => {
        setData({
          activeProvider: (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER,
          activeModel: (result.activeModel as string) ?? 'deepseek-v4-pro',
          autoClassify: result.autoClassify !== false,
          apiKeys: (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {},
        })
        setActiveTab((result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER)
      }
    )
  }, [])

  function setApiKey(providerId: ProviderId, key: string) {
    setData(prev => ({ ...prev, apiKeys: { ...prev.apiKeys, [providerId]: key } }))
  }

  function selectProvider(providerId: ProviderId) {
    const provider = PROVIDER_LIST.find(p => p.id === providerId)!
    setData(prev => ({
      ...prev,
      activeProvider: providerId,
      activeModel: provider.models[0].id,
    }))
  }

  async function handleSave() {
    await chrome.storage.sync.set(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const activeProvider = PROVIDER_LIST.find(p => p.id === data.activeProvider)!
  const tabProvider = PROVIDER_LIST.find(p => p.id === activeTab)!

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* 标题 */}
        <div style={s.header}>
          <span style={{ fontSize: 24 }}>🔖</span>
          <h1 style={s.title}>Smart Bookmark 设置</h1>
        </div>

        {/* 当前使用模型 */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>当前使用</h2>
          <div style={s.row}>
            <div style={s.fieldGroup}>
              <label style={s.label}>AI 提供商</label>
              <select
                value={data.activeProvider}
                onChange={e => selectProvider(e.target.value as ProviderId)}
                style={s.select}
              >
                {PROVIDER_LIST.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>模型</label>
              <select
                value={data.activeModel}
                onChange={e => setData(prev => ({ ...prev, activeModel: e.target.value }))}
                style={s.select}
              >
                {activeProvider.models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          {!data.apiKeys[data.activeProvider] && (
            <div style={s.warning}>⚠ 当前提供商尚未填写 API Key</div>
          )}
        </section>

        {/* API Keys 管理 */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>API Keys</h2>
          {/* 提供商 Tab */}
          <div style={s.tabs}>
            {PROVIDER_LIST.map(p => (
              <button
                key={p.id}
                style={{
                  ...s.tab,
                  ...(activeTab === p.id ? s.tabActive : {}),
                }}
                onClick={() => setActiveTab(p.id)}
              >
                {p.name}
                {data.apiKeys[p.id] && <span style={s.dot} />}
              </button>
            ))}
          </div>

          {/* 当前 Tab 内容 */}
          <div style={s.tabContent}>
            <label style={s.label}>{tabProvider.name} API Key</label>
            <input
              type="password"
              value={data.apiKeys[activeTab] ?? ''}
              onChange={e => setApiKey(activeTab, e.target.value)}
              placeholder={tabProvider.keyPlaceholder}
              style={s.input}
            />
            <p style={s.hint}>
              获取 Key：
              <a href={tabProvider.keyLink} target="_blank" rel="noreferrer" style={s.link}>
                {tabProvider.keyLink.replace('https://', '')}
              </a>
            </p>
          </div>
        </section>

        {/* 行为设置 */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>行为</h2>
          <label style={s.toggleRow}>
            <div>
              <div style={s.label}>新增书签时自动分类</div>
              <div style={s.hint}>关闭后只有手动整理和快捷键会触发 AI</div>
            </div>
            <input
              type="checkbox"
              checked={data.autoClassify}
              onChange={e => setData(prev => ({ ...prev, autoClassify: e.target.checked }))}
              style={s.checkbox}
            />
          </label>

          <div style={{ marginTop: 12 }}>
            <div style={s.label}>快捷键</div>
            <div style={{ ...s.hint, marginTop: 4 }}>
              收藏并分类当前页：<kbd style={s.kbd}>Alt+Shift+S</kbd>
            </div>
            <div style={{ ...s.hint, marginTop: 2 }}>
              可在 <code>chrome://extensions/shortcuts</code> 中自定义
            </div>
          </div>
        </section>

        <button style={s.saveBtn} onClick={handleSave}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 16px',
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 32,
    width: 600,
    height: 'fit-content',
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 20, fontWeight: 700, color: '#111' },
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #f0f0f0',
    paddingBottom: 8,
  },
  row: { display: 'flex', gap: 12 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  select: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    cursor: 'pointer',
  },
  warning: {
    background: '#fef3c7',
    color: '#92400e',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  tab: {
    border: '1px solid #e5e7eb',
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 13,
    background: '#f9fafb',
    color: '#555',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  tabActive: {
    background: '#4f46e5',
    color: '#fff',
    border: '1px solid #4f46e5',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    display: 'inline-block',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: '#f9fafb',
    borderRadius: 10,
    padding: 14,
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'monospace',
    background: '#fff',
  },
  hint: { fontSize: 12, color: '#9ca3af' },
  link: { color: '#4f46e5', textDecoration: 'none' },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    gap: 12,
  },
  checkbox: { width: 18, height: 18, cursor: 'pointer', flexShrink: 0 },
  kbd: {
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  saveBtn: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
}
