import { useState, useEffect, useRef } from 'react'
import type { OrganizeStatus, OrganizeProgress, OrganizePrefs } from '../../lib/organize'
import { DEFAULT_PREFS } from '../../lib/organize'
import { t } from '../../lib/i18n'

interface Props {
  status: OrganizeStatus
  progress: OrganizeProgress
  onOrganize: (prefs: OrganizePrefs) => void
}

export default function OrganizeFAB({ status, progress, onOrganize }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [prefs, setPrefs] = useState<OrganizePrefs>(DEFAULT_PREFS)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.storage.local.get('organizePrefs', (data) => {
      if (data.organizePrefs) setPrefs(prev => ({ ...prev, ...(data.organizePrefs as Partial<OrganizePrefs>) }))
    })
  }, [])

  useEffect(() => {
    if (status === 'success') setToast(t('organizeComplete'))
    else if (status === 'error') setToast(t('organizeFailed'))
    else if (status === 'no-key') setToast(t('noApiKeyToast'))
    if (status !== 'idle' && status !== 'loading') {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  useEffect(() => {
    if (!showConfig) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowConfig(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showConfig])

  function updatePrefs(update: Partial<OrganizePrefs>) {
    const next = { ...prefs, ...update }
    setPrefs(next)
    chrome.storage.local.set({ organizePrefs: next })
  }

  function handleStart() {
    setShowConfig(false)
    onOrganize(prefs)
  }

  const isLoading = status === 'loading'

  return (
    <div className="fab-container" ref={containerRef}>
      {toast && <div className="fab-toast">{toast}</div>}

      {showConfig && (
        <div className="fab-config-panel">
          <div className="fab-config-header">
            <span className="fab-config-title">{t('organizeConfigTitle')}</span>
            <button className="fab-config-close" onClick={() => setShowConfig(false)}>×</button>
          </div>

          <div className="fab-config-section">
            <div className="fab-config-label">{t('organizeGranularity')}</div>
            <div className="fab-seg">
              {(['coarse', 'medium', 'fine'] as const).map(g => (
                <button
                  key={g}
                  className={`fab-seg-btn${prefs.granularity === g ? ' active' : ''}`}
                  onClick={() => updatePrefs({ granularity: g })}
                >
                  {g === 'coarse' ? t('granularityCoarse') : g === 'medium' ? t('granularityMedium') : t('granularityFine')}
                </button>
              ))}
            </div>
            <div className="fab-config-hint">
              {prefs.granularity === 'coarse' && t('granularityHintCoarse')}
              {prefs.granularity === 'medium' && t('granularityHintMedium')}
              {prefs.granularity === 'fine'   && t('granularityHintFine')}
            </div>
          </div>

          <div className="fab-config-section">
            <div className="fab-config-label">{t('organizeNamingLang')}</div>
            <div className="fab-seg">
              {(['zh', 'en', 'auto'] as const).map(l => (
                <button
                  key={l}
                  className={`fab-seg-btn${prefs.namingLang === l ? ' active' : ''}`}
                  onClick={() => updatePrefs({ namingLang: l })}
                >
                  {l === 'zh' ? t('namingLangZh') : l === 'en' ? t('namingLangEn') : t('namingLangAuto')}
                </button>
              ))}
            </div>
          </div>

          <div className="fab-config-section">
            <div className="fab-config-label">{t('organizeClassifyBy')}</div>
            <div className="fab-seg fab-seg--2col">
              {(['topic', 'scenario', 'type', 'platform'] as const).map(cb => (
                <button
                  key={cb}
                  className={`fab-seg-btn${prefs.classifyBy === cb ? ' active' : ''}`}
                  onClick={() => updatePrefs({ classifyBy: cb })}
                >
                  {cb === 'topic'    ? t('classifyByTopic')    :
                   cb === 'scenario' ? t('classifyByScenario') :
                   cb === 'type'     ? t('classifyByType')     :
                                       t('classifyByPlatform')}
                </button>
              ))}
            </div>
            <div className="fab-config-hint">
              {prefs.classifyBy === 'topic'    && t('classifyByHintTopic')}
              {prefs.classifyBy === 'scenario' && t('classifyByHintScenario')}
              {prefs.classifyBy === 'type'     && t('classifyByHintType')}
              {prefs.classifyBy === 'platform' && t('classifyByHintPlatform')}
            </div>
          </div>

          <div className="fab-config-section fab-config-row">
            <div className="fab-config-label">{t('organizeAllowNew')}</div>
            <button
              className={`fab-toggle${prefs.allowNewFolders ? ' active' : ''}`}
              onClick={() => updatePrefs({ allowNewFolders: !prefs.allowNewFolders })}
              aria-pressed={prefs.allowNewFolders}
            >
              <span className="fab-toggle-thumb" />
            </button>
          </div>

          <div className="fab-config-section">
            <div className="fab-config-label">{t('organizeCustom')}</div>
            <textarea
              className="fab-custom-input"
              rows={2}
              placeholder={t('organizeCustomPlaceholder')}
              value={prefs.customInstructions}
              onChange={e => updatePrefs({ customInstructions: e.target.value })}
            />
          </div>

          <button className="fab-start-btn" onClick={handleStart}>
            {t('organizeStartBtn')}
          </button>
        </div>
      )}

      <button
        className={`fab-btn${isLoading ? ' loading' : ''}`}
        onClick={() => { if (!isLoading) setShowConfig(s => !s) }}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="fab-progress">{progress.done}/{progress.total}</span>
        ) : (
          <span className="fab-icon">✦</span>
        )}
      </button>
    </div>
  )
}
