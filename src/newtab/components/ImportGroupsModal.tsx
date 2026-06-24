import { useState, useEffect } from 'react'
import { getOrCreateFolder } from '../../lib/bookmarks'
import { t } from '../../lib/i18n'

type TKey = Parameters<typeof t>[0]

interface SavableTab {
  title: string
  url: string
}

interface GroupInfo {
  id: number
  name: string
  color: string
  tabs: SavableTab[]
}

interface Props {
  onClose: () => void
  onDone: (message: string) => void
}

// Chrome 分组颜色 → i18n 文案 key
const COLOR_KEY: Record<string, TKey> = {
  grey: 'groupColorGrey',
  blue: 'groupColorBlue',
  red: 'groupColorRed',
  yellow: 'groupColorYellow',
  green: 'groupColorGreen',
  pink: 'groupColorPink',
  purple: 'groupColorPurple',
  cyan: 'groupColorCyan',
  orange: 'groupColorOrange',
}

// 分组颜色 → 展示用色点
const COLOR_HEX: Record<string, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#d01884',
  purple: '#9334e6',
  cyan: '#007b83',
  orange: '#fa903e',
}

export default function ImportGroupsModal({ onClose, onDone }: Props) {
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [allWindows, setAllWindows] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const win = await chrome.windows.getCurrent()
      const query = allWindows ? {} : { windowId: win.id }
      const rawGroups = await chrome.tabGroups.query(query)
      const infos = await Promise.all(
        rawGroups.map(async (g): Promise<GroupInfo> => {
          const tabs = await chrome.tabs.query({ groupId: g.id })
          const savable = tabs
            .filter(tb => tb.url?.startsWith('http'))
            .map(tb => ({ title: (tb.title ?? '').trim() || tb.url!, url: tb.url! }))
          const title = g.title?.trim() || t('importGroupsUnnamed', { color: t(COLOR_KEY[g.color] ?? 'groupColorGrey') })
          return { id: g.id, name: title, color: g.color, tabs: savable }
        })
      )
      if (cancelled) return
      setGroups(infos)
      // 勾选「所有窗口」时全选所有分组，取消时全不选
      setSelected(allWindows ? new Set(infos.filter(i => i.tabs.length > 0).map(i => i.id)) : new Set())
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [allWindows])

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    let groupCount = 0
    let bookmarkCount = 0
    for (const g of groups) {
      if (!selected.has(g.id) || g.tabs.length === 0) continue
      // 分组名里的 '/' 会被 getOrCreateFolder 当作层级分隔，先归一化
      const folderName = g.name.replace(/\//g, '-')
      const folderId = await getOrCreateFolder(folderName)
      const existing = await chrome.bookmarks.getChildren(folderId)
      const existingUrls = new Set(existing.filter(c => c.url).map(c => c.url))
      for (const tab of g.tabs) {
        if (existingUrls.has(tab.url)) continue
        await chrome.bookmarks.create({ parentId: folderId, title: tab.title, url: tab.url })
        existingUrls.add(tab.url)
        bookmarkCount++
      }
      groupCount++
    }
    onDone(t('importGroupsDone', { groups: groupCount, bookmarks: bookmarkCount }))
  }

  const selectableCount = groups.filter(g => g.tabs.length > 0 && selected.has(g.id)).length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('importGroupsTitle')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="import-groups-allwin">
            <input
              type="checkbox"
              checked={allWindows}
              onChange={e => setAllWindows(e.target.checked)}
            />
            {t('importGroupsAllWindows')}
          </label>

          {loading ? (
            <div className="import-groups-empty">…</div>
          ) : groups.length === 0 ? (
            <div className="import-groups-empty">{t('importGroupsEmpty')}</div>
          ) : (
            <div className="import-groups-list">
              {groups.map(g => {
                const disabled = g.tabs.length === 0
                return (
                  <label
                    key={g.id}
                    className={`import-group-row${disabled ? ' import-group-row--disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="import-group-check"
                      checked={selected.has(g.id)}
                      disabled={disabled}
                      onChange={() => toggle(g.id)}
                    />
                    <span
                      className="import-group-dot"
                      style={{ background: COLOR_HEX[g.color] ?? COLOR_HEX.grey }}
                    />
                    <span className="import-group-name">{g.name}</span>
                    <span className="import-group-count">{t('importGroupsTabCount', { count: g.tabs.length })}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>{t('cancelBtn')}</button>
          <button
            className="modal-btn save"
            onClick={handleSave}
            disabled={saving || selectableCount === 0}
          >
            {t('importGroupsSave')}
          </button>
        </div>
      </div>
    </div>
  )
}
