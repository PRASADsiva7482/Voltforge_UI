import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Sun, Moon, User, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, TextInput } from '../ui'
import { useThemeStore } from '../../store/themeStore'
import { getNavItems } from '../../config/navigation'
import { useClickOutside } from '../../hooks/useClickOutside'

export type TopbarProps = { eyebrow?: string; title: string }
export function Topbar({ eyebrow = 'Voltforge workspace', title }: TopbarProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  useClickOutside([searchRef], () => setOpen(false))
  const destinations = getNavItems().filter(item => t(item.label).toLowerCase().includes(query.trim().toLowerCase()))
  const searchPath = `/explore?query=${encodeURIComponent(query.trim())}`
  return <header className="app-topbar">
    <div><p className="vf-eyebrow">{t(eyebrow)}</p><h1>{title}</h1></div>
    <div className="app-topbar__actions">
      <div ref={searchRef} className="app-topbar__search" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
        <TextInput aria-label={t('Search public circuits or navigate')} leftSlot={<Search size={16} />} placeholder={t('Find circuits or pages')} value={query}
          onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={e => { if (e.key === 'Enter') { navigate(searchPath); setOpen(false) } }} />
        {open && <div className="app-topbar__search-results" aria-label={t('Search suggestions')}>
          {query.trim() && <Link to={searchPath} onClick={() => setOpen(false)}>{t('Search public circuits')}: “{query.trim()}”</Link>}
          {destinations.map(item => <Link key={item.path} to={item.path} onClick={() => setOpen(false)}>{t(item.label)}</Link>)}
          {!destinations.length && <p>{t('No matching pages. Press Enter to search public circuits.')}</p>}
        </div>}
      </div>
      <select className="vf-input vf-language-select" aria-label={t('Change language')} value={i18n.language?.split('-')[0] || 'en'} onChange={e => void i18n.changeLanguage(e.target.value)}>
        <option value="en">EN</option><option value="hi">हिन्दी</option><option value="te">తెలుగు</option><option value="ta">தமிழ்</option><option value="kn">ಕನ್ನಡ</option><option value="ml">മലയാളം</option><option value="mr">मराठी</option>
      </select>
      <IconButton icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} label={t(theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')} onClick={toggleTheme} />
      <IconButton icon={<User size={17} />} label={t('Profile')} onClick={() => navigate('/profile')} />
      <Button icon={<Plus size={16} />} onClick={() => navigate('/projects/new')} variant="primary">{t('New project')}</Button>
    </div>
  </header>
}
