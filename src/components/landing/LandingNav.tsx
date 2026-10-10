import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Menu, Moon, Play, Sun, X } from 'lucide-react'
import { BrandMark } from '../brand/BrandMark'
import { Button, IconButton } from '../ui'
import { useAuth } from '../../auth/useAuth'
import { useThemeStore } from '../../store/themeStore'

export function LandingNav() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
            Capabilities
          </a>
          <a href="#workflow" onClick={(e) => handleNavClick(e, 'workflow')}>
            Workflow
          </a>
          <a href="#workspace" onClick={(e) => handleNavClick(e, 'workspace')}>
            Workspace
          </a>
          <a href="#preview" onClick={(e) => handleNavClick(e, 'preview')}>
            Preview
          </a>
        </nav>
      </div>

      <div className="landing-nav__actions">
        <IconButton
          icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          label="Toggle theme"
          onClick={toggleTheme}
        />
        
        <Button
          className="landing-nav__sandbox-btn"
          icon={<Play size={14} />}
          onClick={() => navigate('/editor/share')}
          variant="secondary"
          size="sm"
        >
          Sandbox
        </Button>

        {auth.isAuthenticated ? (
          <Button
            trailingIcon={<ArrowRight size={15} />}
            variant="primary"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
        ) : (
          <div className="landing-nav__auth-group">
            <Button
              onClick={auth.login}
              disabled={auth.isRedirecting}
              variant="ghost"
              size="sm"
            >
              Sign In
            </Button>
            <Button
              onClick={auth.signup}
              disabled={auth.isRedirecting}
              variant="primary"
              size="sm"
            >
              Get Started
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
              Capabilities
            </a>
            <a href="#workflow" onClick={(e) => handleNavClick(e, 'workflow')}>
              Workflow
            </a>
            <a href="#workspace" onClick={(e) => handleNavClick(e, 'workspace')}>
              Workspace
            </a>
            <a href="#preview" onClick={(e) => handleNavClick(e, 'preview')}>
              Interactive Preview
            </a>
          </nav>
          <div className="landing-nav__mobile-actions">
            <Button
              icon={<Play size={15} />}
              onClick={() => {
                setMobileMenuOpen(false)
                navigate('/editor/share')
              }}
              variant="secondary"
            >
              Launch Simulator Sandbox
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
                Go to Dashboard
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
                  Sign In
                </Button>
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    auth.signup()
                  }}
                  variant="primary"
                >
                  Create Free Account
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
