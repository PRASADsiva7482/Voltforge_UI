import { useState } from 'react'
import { Bell, Search, Settings, Sun, Moon, Globe } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, TextInput } from '../ui'
import { useThemeStore } from '../../store/themeStore'

export type TopbarProps = {
  eyebrow?: string
  title: string
}

export function Topbar({ eyebrow = 'Voltforge workspace', title }: TopbarProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const { t, i18n } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'te', label: 'తెలుగు' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'mr', label: 'मराठी' },
  ]

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code)
    setLangOpen(false)
  }

  return (
    <header className="app-topbar">
      <div>
        <p className="vf-eyebrow">{t(eyebrow)}</p>
        <h1>{t(title)}</h1>
      </div>
      <div className="app-topbar__actions">
        <TextInput leftSlot={<Search size={16} />} placeholder={t("Search projects, boards, parts")} />
        
        {/* Language selector */}
        <div className="vf-topbar__lang-wrapper" style={{ position: 'relative' }}>
          <IconButton
            icon={<Globe size={17} />}
            label="Change language"
            onClick={() => setLangOpen(!langOpen)}
          />
          {langOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setLangOpen(false)}
              />
              <div className="vf-topbar__lang-dropdown">
                {languages.map((lng) => (
                  <button
                    key={lng.code}
                    className={`vf-topbar__lang-btn ${i18n.language?.startsWith(lng.code) ? 'is-active' : ''}`}
                    onClick={() => changeLanguage(lng.code)}
                  >
                    {lng.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <IconButton icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} label={t("Toggle theme")} onClick={toggleTheme} />
        <IconButton icon={<Bell size={17} />} label={t("Notifications")} />
        <IconButton icon={<Settings size={17} />} label={t("Settings")} onClick={() => navigate('/settings')} />
        <Button onClick={() => navigate('/projects/new')} variant="primary">
          {t("New project")}
        </Button>
      </div>
    </header>
  )
}
