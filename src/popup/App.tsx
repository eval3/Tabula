import { useState } from 'react'
import { PROVIDERS, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { t } from '../lib/i18n'

interface ProviderInfo {
  hasKey: boolean
  label: string
}

export default function App() {
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const [shortcut, setShortcut] = useState<string | null>(null)

  useState(() => {
    chrome.storage.sync.get(['activeProvider', 'activeModel', 'apiKeys'], (result) => {
      const pid: ProviderId = (result.activeProvider as ProviderId) ?? DEFAULT_PROVIDER
      const apiKeys = (result.apiKeys as Partial<Record<ProviderId, string>>) ?? {}
      const key = apiKeys[pid]
      if (!key) {
        setProvider({ hasKey: false, label: '' })
        return
      }
      const p = PROVIDERS[pid]
      const model = (result.activeModel as string) ?? ''
      const modelLabel = p.models.find(m => m.id === model)?.label ?? model
      setProvider({ hasKey: true, label: `${p.name} · ${modelLabel}` })
    })
    chrome.commands.getAll((commands) => {
      const cmd = commands.find(c => c.name === 'classify-and-bookmark')
      setShortcut(cmd?.shortcut ?? '')
    })
  })

  const ready = provider !== null && shortcut !== null
  const needsSetup = ready && (!provider!.hasKey || !shortcut)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <img src="/icons/logo.png" style={styles.logo} alt="" />
        <h1 style={styles.title}>{t('appName')}</h1>
      </div>

      {ready && (
        needsSetup ? (
          <div style={styles.setupCard}>
            <div style={styles.setupTitle}>{t('setupTitle')}</div>
            <CheckItem done={provider!.hasKey} label={t('setupApiKey')} />
            <CheckItem done={!!shortcut} label={t('setupShortcut')} />
          </div>
        ) : (
          <>
            <div style={styles.providerChip}>
              <span style={styles.dot} />
              {provider!.label}
            </div>
            <div style={styles.hint}>
              {t('shortcutHint')}<ShortcutKeys shortcut={shortcut!} kbdStyle={styles.kbd} />
            </div>
          </>
        )
      )}

      <button
        style={{ ...styles.settingsBtn, ...(needsSetup ? styles.settingsBtnPrimary : {}) }}
        onClick={() => chrome.runtime.openOptionsPage()}
      >
        {needsSetup ? t('setupGoBtn') : t('settingsBtn')}
      </button>
    </div>
  )
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={styles.checkItem}>
      <span style={done ? styles.checkDone : styles.checkPending}>
        {done && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ ...styles.checkLabel, ...(done ? styles.checkLabelDone : {}) }}>{label}</span>
    </div>
  )
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
          {i > 0 && <span style={{ color: '#c7c9d1', margin: '0 2px' }}>+</span>}
          <kbd style={kbdStyle}>{key}</kbd>
        </span>
      ))}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1f2937',
  },
  header: { display: 'flex', alignItems: 'center', gap: 9 },
  logo: { width: 26, height: 26 },
  title: { fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' },
  providerChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    background: '#eef2ff',
    color: '#4338ca',
    borderRadius: 20,
    padding: '5px 12px',
    fontSize: 11.5,
    fontWeight: 600,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
  },
  hint: { fontSize: 11.5, color: '#6b7280', lineHeight: 1.7 },
  kbd: {
    display: 'inline-block',
    verticalAlign: 'middle',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 10,
    fontFamily: 'ui-monospace, "SF Mono", monospace',
    color: '#374151',
    boxShadow: '0 1px 0 #d1d5db',
  },
  setupCard: {
    background: 'linear-gradient(160deg, #f5f3ff 0%, #fbfaff 100%)',
    border: '1px solid #e7e4fb',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 11,
  },
  setupTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#4338ca',
    marginBottom: 1,
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontSize: 12.5,
  },
  checkDone: {
    width: 17,
    height: 17,
    borderRadius: '50%',
    background: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkPending: {
    width: 17,
    height: 17,
    borderRadius: '50%',
    border: '1.5px solid #c7c9d1',
    background: '#fff',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  checkLabel: { color: '#374151' },
  checkLabelDone: { color: '#9ca3af' },
  settingsBtn: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 9,
    padding: '9px 0',
    fontSize: 13,
    fontWeight: 500,
    color: '#4b5563',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.15s, border-color 0.15s',
  },
  settingsBtnPrimary: {
    background: '#4f46e5',
    border: '1px solid #4f46e5',
    color: '#fff',
    fontWeight: 600,
  },
}
