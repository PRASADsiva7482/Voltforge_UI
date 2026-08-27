import { Activity, Braces, Cable, Cpu, Gauge, PackageCheck, Play, Zap } from 'lucide-react'
import { Badge, Button } from '../ui'
import { useAuth } from '../../auth/useAuth'

const pins = ['D2', 'D8', '5V', 'GND']

export function HeroCircuitScene() {
  const auth = useAuth()

  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero__copy">
        <Badge dot tone="success">
          Fresh UI2 rebuild
        </Badge>
        <h1 id="landing-title">Build, simulate, ship circuits.</h1>
        <p>Interactive wiring, firmware development, BOM lists, and transient simulation in one flow.</p>
        <div className="landing-hero__actions">
          {auth.isAuthenticated ? (
            <Button onClick={() => window.location.assign('/dashboard')} size="lg" variant="primary">
              Open dashboard
            </Button>
          ) : (
            <>
              <Button onClick={auth.signup} size="lg" variant="primary">
                Start free
              </Button>
              <Button onClick={auth.login} size="lg">
                Login
              </Button>
            </>
          )}
        </div>
        <div className="landing-proof">
          <span>Design</span>
          <span>Validate</span>
          <span>Code</span>
          <span>Export</span>
        </div>
      </div>

      <div className="hero-scene" aria-label="Voltforge circuit workspace preview">
        <div className="hero-scene__toolbar">
          <span />
          <span />
          <span />
          <Badge tone="info">Live simulation</Badge>
        </div>
        <div className="hero-scene__board">
          <svg viewBox="0 0 720 420" role="presentation" preserveAspectRatio="none">
            <path d="M167 118 C260 104 295 196 358 190" />
            <path d="M356 221 C430 228 494 171 556 183" />
            <path d="M360 253 C458 300 501 326 598 309" />
            <path d="M190 302 C272 280 275 234 352 232" />
          </svg>
          <div className="hero-node hero-node--mcu">
            <Cpu size={26} />
            <strong>Arduino Uno</strong>
            <small>ATmega328P</small>
            <div>
              {pins.map((pin) => (
                <i key={pin}>{pin}</i>
              ))}
            </div>
          </div>
          <div className="hero-node hero-node--sensor">
            <Gauge size={22} />
            <strong>Light sensor</strong>
            <small>Signal active</small>
          </div>
          <div className="hero-node hero-node--relay">
            <Zap size={22} />
            <strong>Relay</strong>
            <small>D8 trigger</small>
          </div>
          <div className="hero-node hero-node--bom">
            <PackageCheck size={22} />
            <strong>BOM</strong>
            <small>3 parts ready</small>
          </div>
          <div className="hero-code-card">
            <Braces size={15} />
            <span>humidity &gt; 60</span>
          </div>
          <div className="hero-scope">
            <Activity size={15} />
            <svg viewBox="0 0 180 48" preserveAspectRatio="none">
              <polyline points="0,28 18,28 28,11 43,39 58,28 90,28 101,13 116,37 132,28 180,28" />
            </svg>
          </div>
        </div>
        <div className="hero-scene__footer">
          <span>
            <Cable size={15} />
            Auto-routed signal path
          </span>
          <span>
            <Play size={15} />
            Compile ready
          </span>
        </div>
      </div>
    </section>
  )
}
