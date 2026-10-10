import { useState } from 'react'
import {
  Activity,
  ArrowRight,
  Braces,
  Cable,
  CheckCircle2,
  Code2,
  Cpu,
  Gauge,
  PackageCheck,
  Play,
  Radio,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Badge, Button } from '../ui'
import { useAuth } from '../../auth/useAuth'
import { useNavigate } from 'react-router-dom'

export function HeroCircuitScene() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [activePin, setActivePin] = useState<string | null>('A0')
  const [isSimulating, setIsSimulating] = useState(true)

  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero__copy">
        <div className="landing-hero__badge-container">
          <Badge dot tone="success">
            Next-Gen Browser Electronics Studio
          </Badge>
        </div>

        <h1 id="landing-title">
          Build, simulate, and ship circuits.
        </h1>

        <p className="landing-hero__description">
          The all-in-one cloud workspace for hardware engineers. Wire schematics, write microcontroller firmware, inspect transient signals, and export BOMs in real-time.
        </p>

        <div className="landing-hero__actions">
          {auth.isAuthenticated ? (
            <Button
              onClick={() => navigate('/dashboard')}
              size="lg"
              variant="primary"
              trailingIcon={<ArrowRight size={16} />}
            >
              Open Dashboard
            </Button>
          ) : (
            <>
              <Button
                onClick={auth.signup}
                disabled={auth.isRedirecting}
                size="lg"
                variant="primary"
                trailingIcon={<ArrowRight size={16} />}
              >
                Start Free
              </Button>
              <Button
                onClick={() => navigate('/editor/share')}
                size="lg"
                variant="secondary"
                icon={<Play size={16} />}
              >
                Launch Sandbox
              </Button>
            </>
          )}
        </div>

        <div className="landing-proof">
          <span className="landing-proof__item">
            <Zap size={14} className="text-teal" />
            <span>MNA Solver</span>
          </span>
          <span className="landing-proof__item">
            <Cpu size={14} className="text-teal" />
            <span>AVR8js 16MHz</span>
          </span>
          <span className="landing-proof__item">
            <Code2 size={14} className="text-teal" />
            <span>C++ IDE</span>
          </span>
          <span className="landing-proof__item">
            <PackageCheck size={14} className="text-teal" />
            <span>Instant BOM</span>
          </span>
        </div>
      </div>

      <div className="hero-scene" aria-label="Voltforge circuit workspace preview" id="preview">
        <div className="hero-scene__toolbar">
          <div className="hero-scene__dots">
            <span className="hero-scene__dot hero-scene__dot--red" />
            <span className="hero-scene__dot hero-scene__dot--yellow" />
            <span className="hero-scene__dot hero-scene__dot--green" />
          </div>
          <div className="hero-scene__title">
            <Cpu size={14} />
            <span>Voltforge Studio · Lab #04: Opto-Relay Trigger</span>
          </div>
          <div className="hero-scene__toolbar-actions">
            <button
              type="button"
              className={`hero-scene__sim-btn ${isSimulating ? 'is-active' : ''}`}
              onClick={() => setIsSimulating(!isSimulating)}
              title="Toggle virtual circuit power"
            >
              <Radio size={13} className={isSimulating ? 'vf-pulse-icon' : ''} />
              <span>{isSimulating ? 'Simulating (10kHz)' : 'Paused'}</span>
            </button>
          </div>
        </div>

        <div className="hero-scene__board">
          {/* Animated SVG Circuit Traces */}
          <svg
            className={`hero-scene__wires ${isSimulating ? 'is-active' : ''}`}
            viewBox="0 0 760 440"
            role="presentation"
            preserveAspectRatio="none"
          >
            {/* Trace 1: Sensor Signal -> Arduino Pin A0 */}
            <path
              className="circuit-wire circuit-wire--analog"
              d="M 215 150 C 290 150, 310 205, 360 215"
            />
            {/* Signal Flow Pulse on Trace 1 */}
            <path
              className="circuit-pulse circuit-pulse--cyan"
              d="M 215 150 C 290 150, 310 205, 360 215"
            />

            {/* Trace 2: Arduino Pin D8 -> Relay Trigger IN */}
            <path
              className="circuit-wire circuit-wire--digital"
              d="M 470 215 C 530 210, 560 160, 610 160"
            />
            {/* Signal Flow Pulse on Trace 2 */}
            <path
              className="circuit-pulse circuit-pulse--amber"
              d="M 470 215 C 530 210, 560 160, 610 160"
            />

            {/* Trace 3: Arduino Power -> Breadboard Rail */}
            <path
              className="circuit-wire circuit-wire--power"
              d="M 370 245 C 310 280, 260 290, 205 315"
            />
            {/* Trace 4: Arduino -> Oscilloscope Probe */}
            <path
              className="circuit-wire circuit-wire--scope"
              d="M 455 245 C 475 295, 420 330, 395 345"
            />
          </svg>

          {/* Microcontroller: Arduino Uno R3 */}
          <div className="hero-node hero-node--mcu">
            <div className="hero-node__header">
              <Cpu size={24} className="text-teal" />
              <div>
                <strong>Arduino Uno R3</strong>
                <small>ATmega328P · 16 MHz</small>
              </div>
            </div>
            <div className="hero-node__mcu-pills">
              <span
                className={`mcu-pin ${activePin === '5V' ? 'is-active' : ''}`}
                onClick={() => setActivePin('5V')}
              >
                5V
              </span>
              <span
                className={`mcu-pin ${activePin === 'GND' ? 'is-active' : ''}`}
                onClick={() => setActivePin('GND')}
              >
                GND
              </span>
              <span
                className={`mcu-pin ${activePin === 'A0' ? 'is-active' : ''}`}
                onClick={() => setActivePin('A0')}
              >
                A0 (Analog)
              </span>
              <span
                className={`mcu-pin ${activePin === 'D8' ? 'is-active' : ''}`}
                onClick={() => setActivePin('D8')}
              >
                D8 (PWM)
              </span>
            </div>
            <div className="hero-node__status-bar">
              <span className="hero-node__led-dot" />
              <span>TX/RX Heartbeat Active</span>
            </div>
          </div>

          {/* Input: LDR Light Sensor */}
          <div className="hero-node hero-node--sensor">
            <div className="hero-node__icon-box">
              <Gauge size={20} />
            </div>
            <div>
              <strong>LDR Light Sensor</strong>
              <small>Analog Out · 3.2V (640 Lux)</small>
            </div>
          </div>

          {/* Output: 5V Relay Switch */}
          <div className="hero-node hero-node--relay">
            <div className="hero-node__icon-box hero-node__icon-box--amber">
              <Zap size={20} />
            </div>
            <div>
              <strong>5V Opto-Relay</strong>
              <small>State: Energized (NC Opened)</small>
            </div>
          </div>

          {/* BOM Quick Card */}
          <div className="hero-node hero-node--bom">
            <div className="hero-node__icon-box hero-node__icon-box--teal">
              <PackageCheck size={20} />
            </div>
            <div>
              <strong>Bill of Materials</strong>
              <small>3 Parts Verified · Footprints OK</small>
            </div>
          </div>

          {/* Live Firmware Logic Pill */}
          <div className="hero-code-card">
            <Braces size={15} className="text-teal" />
            <code>if (analogRead(A0) &gt; 300) digitalWrite(8, HIGH);</code>
          </div>

          {/* Oscilloscope Waveform Display */}
          <div className="hero-scope">
            <div className="hero-scope__label">
              <Activity size={14} className="text-teal" />
              <span>Scope Ch1: 10 kHz</span>
            </div>
            <svg viewBox="0 0 160 40" preserveAspectRatio="none">
              <polyline points="0,20 20,20 30,5 45,35 60,20 85,20 95,5 110,35 125,20 160,20" />
            </svg>
          </div>
        </div>

        <div className="hero-scene__footer">
          <span>
            <Cable size={14} />
            Interactive Netlist Routing
          </span>
          <span className="hero-scene__footer-right">
            <CheckCircle2 size={14} className="text-teal" />
            AVR transient solver synchronized
          </span>
        </div>
      </div>
    </section>
  )
}
