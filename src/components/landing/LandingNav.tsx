import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Moon, Sun } from 'lucide-react'
import { BrandMark } from '../brand/BrandMark'
import { Button, IconButton } from '../ui'
import { useAuth } from '../../auth/useAuth'
import { useThemeStore } from '../../store/themeStore'

export function LandingNav() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()

  return (
    <header className="landing-nav">
      <Link aria-label="Voltforge home" to="/">
        <BrandMark />
      </Link>
      <nav aria-label="Landing sections">
        <a href="#capabilities">Capabilities</a>
        <a href="#workflow">Workflow</a>
        <a href="#workspace">Workspace</a>
      </nav>
      <div className="landing-nav__actions">
        <IconButton icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} label="Toggle theme" onClick={toggleTheme} />
        {auth.isAuthenticated ? (
          <Button trailingIcon={<ArrowRight size={15} />} variant="primary" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
        ) : (
          <>
            <Button onClick={auth.login} disabled={auth.isRedirecting} variant="ghost">
              Login
            </Button>
            <Button onClick={auth.signup} disabled={auth.isRedirecting} variant="primary">
              Sign up
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
