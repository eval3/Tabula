import { useState, useEffect } from 'react'
import { PROVIDER_LIST, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { fetchProviderModels, type ModelOption } from '../lib/models'
import { t } from '../lib/i18n'

// 动态模型列表缓存有效期：超过则后台刷新
const MODEL_CACHE_TTL = 12 * 60 * 60 * 1000
type ModelCache = Partial<Record<ProviderId, { models: ModelOption[]; ts: number }>>

interface StorageData {
  activeProvider: ProviderId
  activeModel: string
  apiKeys: Partial<Record<ProviderId, string>>
}

const DEFAULT_DATA: StorageData = {
  activeProvider: DEFAULT_PROVIDER,
  activeModel: 'deepseek-v4-pro',
  apiKeys: {},
}

export default function OptionsApp() {
  const [data, setData] = useState<StorageData>(DEFAULT_DATA)
  const [page, setPage] = useState<'main' | 'add'>('main')
  const [addTab, setAddTab] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [addKey, setAddKey] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [dynamicModels, setDynamicModels] = useState<Partial<Record<ProviderId, ModelOption[]>>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState(false)

  useEffect(() => {
    const fetchShortcut = () => {
      chrome.commands.getAll((commands) => {
        const cmd = commands.find(c => c.name === 'classify-and-bookmark')
        setShortcut(cmd?.shortcut ?? '')
      })
    }
    fetchShortcut()
    window.addEventListener('focus', fetchShortcut)
    return () => window.removeEventListener('focus', fetchShortcut)
  }, [])

  useEffect(() => {
    chrome.storage.sync.get(
      ['activeProvider', 'activeModel', 'apiKeys'],
      (result) => {
        setData({
          activeProvider: (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER,
          activeModel: (result.activeModel as string) ?? 'deepseek-v4-pro',
          apiKeys: (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {},
        })
      }
    )
  }, [])

  // 启动时读取上次缓存的动态模型列表
  useEffect(() => {
    chrome.storage.local.get('modelCache', (result) => {
      const cache = (result.modelCache as ModelCache) ?? {}
      const restored: Partial<Record<ProviderId, ModelOption[]>> = {}
      for (const [id, entry] of Object.entries(cache)) {
        if (entry?.models?.length) restored[id as ProviderId] = entry.models
      }
      setDynamicModels(restored)
    })
  }, [])

  useEffect(() => {
    if (providersWithKey.length > 0 && !data.apiKeys[data.activeProvider]) {
      selectProvider(providersWithKey[0].id)
    }
  }, [data.apiKeys])

  // 切到某个已配置 Key 的提供商时，按需拉取最新模型（缓存未过期则跳过）
  useEffect(() => {
    const apiKey = data.apiKeys[data.activeProvider]
    if (!apiKey) return
    chrome.storage.local.get('modelCache', (result) => {
      const entry = (result.modelCache as ModelCache)?.[data.activeProvider]
      if (entry && Date.now() - entry.ts < MODEL_CACHE_TTL) return
      loadModels(data.activeProvider, apiKey)
    })
  }, [data.activeProvider, data.apiKeys])

  async function loadModels(providerId: ProviderId, apiKey: string) {
    setModelsLoading(true)
    setModelsError(false)
    try {
      const models = await fetchProviderModels(providerId, apiKey)
      if (models.length === 0) throw new Error('empty model list')
      setDynamicModels(prev => ({ ...prev, [providerId]: models }))
      chrome.storage.local.get('modelCache', (result) => {
        const cache = (result.modelCache as ModelCache) ?? {}
        cache[providerId] = { models, ts: Date.now() }
        chrome.storage.local.set({ modelCache: cache })
      })
      // 当前选中的模型若不在新列表中，自动切到第一个，避免下拉框空选
      setData(prev => {
        if (prev.activeProvider !== providerId) return prev
        if (models.some(m => m.id === prev.activeModel)) return prev
        const next = { ...prev, activeModel: models[0].id }
        chrome.storage.sync.set(next)
        return next
      })
    } catch (err) {
      console.warn('[Tabula] 拉取模型列表失败:', err)
      setModelsError(true)
    } finally {
      setModelsLoading(false)
    }
  }

  async function selectProvider(providerId: ProviderId) {
    const provider = PROVIDER_LIST.find(p => p.id === providerId)!
    const firstModel = dynamicModels[providerId]?.[0]?.id ?? provider.models[0].id
    const newData = { ...data, activeProvider: providerId, activeModel: firstModel }
    setData(newData)
    await chrome.storage.sync.set(newData)
  }

  function openAddPage() {
    const firstWithoutKey = PROVIDER_LIST.find(p => !data.apiKeys[p.id])
    const tab = firstWithoutKey?.id ?? DEFAULT_PROVIDER
    setAddTab(tab)
    setAddKey(data.apiKeys[tab] ?? '')
    setPage('add')
  }

  async function handleAddKey() {
    if (!addKey.trim()) return
    const newApiKeys = { ...data.apiKeys, [addTab]: addKey.trim() }
    const newData = { ...data, apiKeys: newApiKeys }
    setData(newData)
    await chrome.storage.sync.set(newData)
    setAddKey('')
    setPage('main')
  }

  async function handleClearKey() {
    const newApiKeys = { ...data.apiKeys }
    delete newApiKeys[addTab]
    const newData = { ...data, apiKeys: newApiKeys }
    setData(newData)
    await chrome.storage.sync.set(newData)
    setAddKey('')
  }

  const providersWithKey = PROVIDER_LIST.filter(p => data.apiKeys[p.id])
  const activeProvider = PROVIDER_LIST.find(p => p.id === data.activeProvider)!
  const tabProvider = PROVIDER_LIST.find(p => p.id === addTab)!
  const availableModels = dynamicModels[data.activeProvider] ?? activeProvider.models

  if (page === 'add') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.header}>
            <button style={s.backBtn} onClick={() => setPage('main')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12L6 8L10 4" stroke="#374151" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h1 style={s.title}>{t('addApiKeyTitle')}</h1>
          </div>

          {!data.apiKeys[data.activeProvider] && (
            <div style={s.warning}>{t('apiKeyMissingWarning')}</div>
          )}

          <div style={s.tabs}>
            {PROVIDER_LIST.map(p => (
              <button
                key={p.id}
                style={{
                  ...s.tab,
                  ...(addTab === p.id ? s.tabActive : {}),
                }}
                onClick={() => { setAddTab(p.id); setAddKey(data.apiKeys[p.id] ?? '') }}
              >
                {p.name}
                {data.apiKeys[p.id] && <span style={s.dot} />}
              </button>
            ))}
          </div>

          <div style={s.tabContent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={s.label}>{tabProvider.name} API Key</label>
              {data.apiKeys[addTab] && (
                <button style={s.clearBtn} onClick={handleClearKey}>{t('clearKeyBtn')}</button>
              )}
            </div>
            <input
              type="password"
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              placeholder={tabProvider.keyPlaceholder}
              style={s.input}
              autoFocus
            />
            <p style={s.hint}>
              {t('getKeyLabel')}
              <a href={tabProvider.keyLink} target="_blank" rel="noreferrer" style={s.link}>
                {tabProvider.keyLink.replace('https://', '')}
              </a>
            </p>
          </div>

          <button
            style={{ ...s.saveBtn, ...(!addKey.trim() ? s.saveBtnDisabled : {}) }}
            onClick={handleAddKey}
            disabled={!addKey.trim()}
          >
            {t('confirmAddBtn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <img src="/icons/logo.png" style={{ width: 28, height: 28 }} alt="" />
          <h1 style={s.title}>{t('settingsPageTitle')}</h1>
          <button style={s.addBtn} onClick={openAddPage} title={t('addApiKeyTitle')}>+</button>
        </div>

        <section style={s.section}>
          <h2 style={s.sectionTitle}>{t('sectionCurrentUsage')}</h2>
          {providersWithKey.length === 0 ? (
            <div style={s.warning}>{t('noProviderHint')}</div>
          ) : (
            <div style={s.row}>
              <div style={s.fieldGroup}>
                <label style={s.label}>{t('labelAiProvider')}</label>
                <select
                  value={data.activeProvider}
                  onChange={e => selectProvider(e.target.value as ProviderId)}
                  style={s.select}
                >
                  {providersWithKey.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={s.fieldGroup}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={s.label}>{t('labelModel')}</label>
                  <button
                    style={{ ...s.refreshBtn, ...(modelsLoading ? s.refreshBtnSpinning : {}) }}
                    onClick={() => {
                      const apiKey = data.apiKeys[data.activeProvider]
                      if (apiKey && !modelsLoading) loadModels(data.activeProvider, apiKey)
                    }}
                    title={t('refreshModelsTitle')}
                    disabled={modelsLoading}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 2.5V5H11" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                <select
                  value={data.activeModel}
                  onChange={e => {
                    const newData = { ...data, activeModel: e.target.value }
                    setData(newData)
                    chrome.storage.sync.set(newData)
                  }}
                  style={s.select}
                >
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                {modelsLoading && <span style={s.modelsNote}>{t('modelsLoading')}</span>}
                {modelsError && !modelsLoading && <span style={s.modelsNote}>{t('modelsFetchError')}</span>}
              </div>
            </div>
          )}
        </section>

        <section style={s.section}>
          <h2 style={s.sectionTitle}>{t('sectionBehavior')}</h2>
          <div>
            <div style={s.label}>{t('shortcutLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={s.hint}>
                {t('shortcutDescLabel')}
                {shortcut ? <ShortcutKeys shortcut={shortcut} kbdStyle={s.kbd} /> : t('shortcutNotSet')}
              </div>
              <button
                style={s.shortcutBtn}
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              >
                {shortcut ? t('shortcutCustomizeBtn') : t('shortcutSetBtn')}
              </button>
            </div>
          </div>
          <div style={s.privacyNote}>
            <div style={s.privacyNoteTitle}>{t('privacyNoteLabel')}</div>
            <div>{t('privacyNote')}</div>
          </div>
        </section>

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
  title: { fontSize: 20, fontWeight: 700, color: '#111', flex: 1 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid #d1d5db',
    background: '#f9fafb',
    color: '#374151',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
  },
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
    padding: '8px 30px 8px 10px',
    fontSize: 14,
    background: `#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 10px center`,
    appearance: 'none' as const,
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
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
  privacyNote: {
    background: '#f9fafb',
    border: '1px solid #eef0f2',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.65,
    marginTop: 10,
  },
  privacyNoteTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#4b5563',
    marginBottom: 3,
  },
  shortcutBtn: {
    fontSize: 12,
    color: '#4b5563',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '3px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  link: { color: '#4f46e5', textDecoration: 'none' },
  refreshBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  refreshBtnSpinning: {
    animation: 'tabula-spin 0.8s linear infinite',
    cursor: 'default',
  },
  modelsNote: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
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
  saveBtnDisabled: {
    background: '#c7c7e8',
    cursor: 'not-allowed',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
}

function splitShortcut(shortcut: string): string[] {
  if (shortcut.includes('+')) return shortcut.split('+')
  return [...shortcut]
}

function ShortcutKeys({ shortcut, kbdStyle }: { shortcut: string; kbdStyle: React.CSSProperties }) {
  const keys = splitShortcut(shortcut)
  return (
    <>
      {keys.map((key, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: '#aaa', margin: '0 1px' }}>+</span>}
          <kbd style={kbdStyle}>{key}</kbd>
        </span>
      ))}
    </>
  )
}
