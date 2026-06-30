import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandMark } from '../brand/BrandMark'
import { Button } from '../ui'
import { useAuth } from '../../auth/useAuth'

export function LandingNav() {
  const auth = useAuth()

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
        {auth.isAuthenticated ? (
          <Button trailingIcon={<ArrowRight size={15} />} variant="primary" onClick={() => window.location.assign('/dashboard')}>
            Dashboard
          </Button>
        ) : (
          <>
            <Button onClick={auth.login} variant="ghost">
              Login
            </Button>
            <Button onClick={auth.signup} variant="primary">
              Sign up
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
