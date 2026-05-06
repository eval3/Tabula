import { useState, useEffect } from 'react'
import type { OrganizeStatus, OrganizeProgress } from '../../lib/organize'

interface Props {
  status: OrganizeStatus
  progress: OrganizeProgress
  onOrganize: () => void
}

export default function OrganizeFAB({ status, progress, onOrganize }: Props) {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'success') {
      setToast('整理完成 ✓')
    } else if (status === 'error') {
      setToast('整理失败')
    } else if (status === 'no-key') {
      setToast('请先配置 API Key')
    }
    if (status !== 'idle' && status !== 'loading') {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const isLoading = status === 'loading'

  return (
    <div className="fab-container">
      {toast && <div className="fab-toast">{toast}</div>}
      <button
        className={`fab-btn${isLoading ? ' loading' : ''}`}
        onClick={onOrganize}
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
