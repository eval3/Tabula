import { useState } from 'react'
import { PROVIDERS, DEFAULT_PROVIDER, type ProviderId } from '../lib/providers'
import { organizeAllBookmarks, type OrganizeProgress, type OrganizeStatus } from '../lib/organize'
import { t } from '../lib/i18n'

export default function App() {
  const [status, setStatus] = useState<OrganizeStatus>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState('')

  async function handleOrganizeAll() {
    console.log('[SmartBookmark] 点击一键整理')
    setStatus('loading')
    const result = await organizeAllBookmarks((p: OrganizeProgress) => setProgress(p))
    if (result.status === 'no-key') {
      setStatus('no-key')
    } else if (result.status === 'error') {
      setErrorMsg(result.error ?? '未知错误')
      setStatus('error')
    } else {
      setStatus('success')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <img src="/icons/logo.png" style={styles.logo} alt="" />
        <h1 style={styles.title}>{t('appName')}</h1>
      </div>

      <ActiveProviderBadge />

      {status === 'no-key' && (
        <div style={styles.warning}>{t('noApiKeyWarning')}</div>
      )}
      {status === 'error' && (
        <div style={styles.error}>{t('organizeError', { error: errorMsg })}</div>
      )}
      {status === 'success' && (
        <div style={styles.success}>{t('organizeSuccess', { total: progress.total })}</div>
      )}
      {status === 'loading' && (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>{t('organizing', { done: progress.done, total: progress.total })}</div>
          <div style={styles.progressBar}>
            <div style={{
              ...styles.progressFill,
              width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
            }} />
          </div>
        </div>
      )}

      <div style={styles.hint}>
        {t('shortcutHint')}<kbd style={styles.kbd}>Alt+Shift+S</kbd>
      </div>

      <button style={styles.settingsBtn} onClick={() => chrome.runtime.openOptionsPage()}>
        {t('settingsBtn')}
      </button>
    </div>
  )
}

function ActiveProviderBadge() {
  const [label, setLabel] = useState(t('badgeLoading'))

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
  logo: { width: 24, height: 24 },
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
