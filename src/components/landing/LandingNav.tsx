import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Globe, Menu, Moon, Play, Sun, X } from 'lucide-react'
import { BrandMark } from '../brand/BrandMark'
import { Button, IconButton } from '../ui'
import { useAuth } from '../../auth/useAuth'
import { useThemeStore } from '../../store/themeStore'
import { useTranslation } from 'react-i18next'

export function LandingNav() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const { t, i18n } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
    void i18n.changeLanguage(code)
    setLangOpen(false)
  }

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header className="landing-nav">
      <div className="landing-nav__left">
        <Link aria-label="Voltforge home" to="/" className="landing-nav__brand">
          <BrandMark />
        </Link>
        <nav className="landing-nav__links" aria-label="Landing sections">
          <a href="#capabilities" onClick={(e) => handleNavClick(e, 'capabilities')}>
            {t("Capabilities")}
          </a>
          <a href="#workflow" onClick={(e) => handleNavClick(e, 'workflow')}>
            {t("Workflow")}
          </a>
          <a href="#workspace" onClick={(e) => handleNavClick(e, 'workspace')}>
            {t("Workspace")}
          </a>
          <a href="#preview" onClick={(e) => handleNavClick(e, 'preview')}>
            {t("Preview")}
          </a>
        </nav>
      </div>

      <div className="landing-nav__actions">
        <div className="vf-topbar__lang-wrapper" style={{ position: 'relative' }}>
          <IconButton
            icon={<Globe size={17} />}
            label={t("Change language")}
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

        <IconButton
          icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          label={t("Toggle theme")}
          onClick={toggleTheme}
        />
        
        <Button
          className="landing-nav__sandbox-btn"
          icon={<Play size={14} />}
          onClick={() => navigate('/editor/share')}
          variant="secondary"
          size="sm"
        >
          {t("Sandbox")}
        </Button>

        {auth.isAuthenticated ? (
          <Button
            trailingIcon={<ArrowRight size={15} />}
            variant="primary"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            {t("Dashboard")}
          </Button>
        ) : (
          <div className="landing-nav__auth-group">
            <Button
              onClick={auth.login}
              disabled={auth.isRedirecting}
              variant="ghost"
              size="sm"
            >
              {t("Sign In")}
            </Button>
            <Button
              onClick={auth.signup}
              disabled={auth.isRedirecting}
              variant="primary"
              size="sm"
            >
              {t("Sign Up")}
            </Button>
          </div>
        )}

        <button
          type="button"
          className="landing-nav__mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="landing-nav__mobile-menu">
          <nav className="landing-nav__mobile-links">
            <a href="#capabilities" onClick={(e) => handleNavClick(e, 'capabilities')}>
              {t("Capabilities")}
            </a>
            <a href="#workflow" onClick={(e) => handleNavClick(e, 'workflow')}>
              {t("Workflow")}
            </a>
            <a href="#workspace" onClick={(e) => handleNavClick(e, 'workspace')}>
              {t("Workspace")}
            </a>
            <a href="#preview" onClick={(e) => handleNavClick(e, 'preview')}>
              {t("Preview")}
            </a>
          </nav>
          <div className="landing-nav__mobile-languages" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '12px 16px', borderTop: '1px solid var(--vf-border)' }}>
            {languages.map((lng) => (
              <button
                key={lng.code}
                className={`vf-topbar__lang-btn ${i18n.language?.startsWith(lng.code) ? 'is-active' : ''}`}
                style={{
                  width: 'auto',
                  borderRadius: '6px',
                  border: '1px solid var(--vf-border)',
                  padding: '6px 12px',
                  background: i18n.language?.startsWith(lng.code) ? 'var(--vf-accent-soft, rgba(0, 255, 200, 0.12))' : 'transparent',
                  color: i18n.language?.startsWith(lng.code) ? 'var(--vf-accent)' : 'var(--vf-text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  changeLanguage(lng.code)
                  setMobileMenuOpen(false)
                }}
              >
                {lng.label}
              </button>
            ))}
          </div>
          <div className="landing-nav__mobile-actions">
            <Button
              icon={<Play size={15} />}
              onClick={() => {
                setMobileMenuOpen(false)
                navigate('/editor/share')
              }}
              variant="secondary"
            >
              {t("Launch Simulator Sandbox")}
            </Button>
            {auth.isAuthenticated ? (
              <Button
                trailingIcon={<ArrowRight size={15} />}
                onClick={() => {
                  setMobileMenuOpen(false)
                  navigate('/dashboard')
                }}
                variant="primary"
              >
                {t("Dashboard")}
              </Button>
            ) : (
              <div className="landing-nav__mobile-auth">
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    auth.login()
                  }}
                  variant="ghost"
                >
                  {t("Sign In")}
                </Button>
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    auth.signup()
                  }}
                  variant="primary"
                >
                  {t("Sign Up")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
