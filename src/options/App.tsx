import { useState, useEffect } from 'react'
import { PROVIDER_LIST, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { t } from '../lib/i18n'

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
  const [page, setPage] = useState<'main' | 'add'>('main')
  const [addTab, setAddTab] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [addKey, setAddKey] = useState('')
  const [shortcut, setShortcut] = useState('Alt+Shift+S')

  useEffect(() => {
    const fetchShortcut = () => {
      chrome.commands.getAll((commands) => {
        const cmd = commands.find(c => c.name === 'classify-and-bookmark')
        if (cmd?.shortcut) setShortcut(cmd.shortcut)
      })
    }
    fetchShortcut()
    window.addEventListener('focus', fetchShortcut)
    return () => window.removeEventListener('focus', fetchShortcut)
  }, [])

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
      }
    )
  }, [])

  useEffect(() => {
    if (providersWithKey.length > 0 && !data.apiKeys[data.activeProvider]) {
      selectProvider(providersWithKey[0].id)
    }
  }, [data.apiKeys])

  async function selectProvider(providerId: ProviderId) {
    const provider = PROVIDER_LIST.find(p => p.id === providerId)!
    const newData = { ...data, activeProvider: providerId, activeModel: provider.models[0].id }
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
                <label style={s.label}>{t('labelModel')}</label>
                <select
                  value={data.activeModel}
                  onChange={e => {
                    const newData = { ...data, activeModel: e.target.value }
                    setData(newData)
                    chrome.storage.sync.set(newData)
                  }}
                  style={s.select}
                >
                  {activeProvider.models.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        <section style={s.section}>
          <h2 style={s.sectionTitle}>{t('sectionBehavior')}</h2>
          <label style={s.toggleRow}>
            <div>
              <div style={s.label}>{t('autoClassifyLabel')}</div>
              <div style={s.hint}>{t('autoClassifyHint')}</div>
            </div>
            <input
              type="checkbox"
              checked={data.autoClassify}
              onChange={e => {
                const newData = { ...data, autoClassify: e.target.checked }
                setData(newData)
                chrome.storage.sync.set(newData)
              }}
              style={s.checkbox}
            />
          </label>

          <div style={{ marginTop: 12 }}>
            <div style={s.label}>{t('shortcutLabel')}</div>
            <div style={{ ...s.hint, marginTop: 4 }}>
              {t('shortcutDescLabel')}<ShortcutKeys shortcut={shortcut} kbdStyle={s.kbd} />
            </div>
            <div style={{ ...s.hint, marginTop: 2 }}>
              {t('shortcutCustomizeHint')}
            </div>
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
