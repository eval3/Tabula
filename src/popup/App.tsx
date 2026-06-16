import { useState } from 'react'
import { PROVIDERS, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { t } from '../lib/i18n'

interface ProviderInfo {
  hasKey: boolean
  label: string
}

export default function App() {
  const [provider, setProvider] = useState<ProviderInfo | null>(null)

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
  })

  function handleSave() {
    chrome.runtime.sendMessage({ type: 'classify-and-bookmark' })
    window.close()
  }

  const ready = provider !== null
  const needsSetup = ready && !provider!.hasKey

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <img src="/icons/logo.png" style={styles.logo} alt="" />
        <h1 style={styles.title}>{t('appName')}</h1>
      </div>

      {ready && (
        needsSetup ? (
          <div style={styles.setupCard}>
            <div style={styles.setupIconWrap}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="15.5" r="5.5" />
                <path d="m21 2-9.6 9.6" />
                <path d="m15.5 7.5 3 3L22 7l-3-3" />
              </svg>
            </div>
            <div style={styles.setupTextWrap}>
              <div style={styles.setupTitle}>{t('setupTitle')}</div>
              <div style={styles.setupDesc}>{t('setupApiKeyDesc')}</div>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.providerChip}>
              <span style={styles.dot} />
              {provider!.label}
            </div>
            <button style={styles.saveBtn} onClick={handleSave}>
              {t('saveCurrentTabBtn')}
            </button>
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
  saveBtn: {
    background: '#4f46e5',
    border: 'none',
    borderRadius: 9,
    padding: '11px 0',
    fontSize: 13.5,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
  },
  setupCard: {
    background: 'linear-gradient(160deg, #f5f3ff 0%, #fbfaff 100%)',
    border: '1px solid #e7e4fb',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  setupIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: '#e0e7ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  setupTextWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  setupTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#4338ca',
  },
  setupDesc: {
    fontSize: 11.5,
    color: '#6b7280',
    lineHeight: 1.5,
  },
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
