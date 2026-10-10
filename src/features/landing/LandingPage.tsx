import {
  ArrowRight,
  Braces,
  CircuitBoard,
  Code2,
  Compass,
  Cpu,
  FileOutput,
  Gauge,
  GraduationCap,
  PackageCheck,
  Play,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { CapabilityCard, HeroCircuitScene, LandingNav, MenuPreview, WorkflowStrip } from '../../components/landing'
import { BrandMark } from '../../components/brand/BrandMark'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth/useAuth'

const capabilities = [
  {
    icon: CircuitBoard,
    label: 'Circuit Editor',
    text: 'Interactive schematic canvas for placing microcontrollers, ICs, passive components, and custom point-to-point netlist wires.',
    tag: 'Interactive Canvas',
    highlights: ['Snap-to-grid wire routing', 'Live breadboard simulation', 'Dynamic voltage probe tips'],
  },
  {
    icon: Code2,
    label: 'Firmware Studio',
    text: 'Write, compile, and debug microcontroller sketch code directly in the browser with cycle-accurate execution.',
    tag: 'AVR & ARM C++',
    highlights: ['Monaco editor with autocomplete', 'Cycle-accurate 16MHz clock', 'Integrated serial terminal monitor'],
  },
  {
    icon: Gauge,
    label: 'Signal Simulation',
    text: 'Run real-time electrical transient solvers and inspect GPIO waveforms, PWM duties, and analog sensor readings.',
    tag: 'MNA Solver Engine',
    highlights: ['Modified Nodal Analysis solver', 'Virtual multi-channel scope', 'Logic level transition probes'],
  },
  {
    icon: GraduationCap,
    label: 'Challenge Labs',
    text: 'Master hardware engineering with guided interactive circuit puzzles and automated test bench validations.',
    tag: 'Interactive Labs',
    highlights: ['Real-world challenge problems', 'Automated circuit test criteria', 'Guided hint progression system'],
  },
  {
    icon: PackageCheck,
    label: 'BOM & Part Sourcing',
    text: 'Generate real-time Bill of Materials with accurate component footprints, package details, and exportable parts lists.',
    tag: 'Production Ready',
    highlights: ['Instant BOM export (CSV/JSON)', 'Accurate footprint specifications', 'Part count & cost estimation'],
  },
  {
    icon: Share2,
    label: 'Cloud Sync & Sharing',
    text: 'Save circuits to your private workspace, collaborate with teammates, or share live interactive preview links with one click.',
    tag: 'Zero-Install Cloud',
    highlights: ['One-click public circuit links', 'Fork & remix community circuits', 'Guarded by Voltforge TLS enclave'],
  },
]

const workflow = [
  {
    icon: CircuitBoard,
    label: 'Wire Schematic',
    stepNumber: '01',
    description: 'Assemble Arduino, ESP32, sensors, and passive components with interactive snap-to-grid netlist routing.',
  },
  {
    icon: Braces,
    label: 'Write Firmware',
    stepNumber: '02',
    description: 'Develop C++/Arduino code in the browser IDE with instant syntax compilation and serial debug output.',
  },
  {
    icon: Play,
    label: 'Simulate & Probe',
    stepNumber: '03',
    description: 'Execute cycle-accurate AVR simulation, probe GPIO logic, and view real-time waveforms on the virtual oscilloscope.',
  },
  {
    icon: FileOutput,
    label: 'Export & Share',
    stepNumber: '04',
    description: 'Export bill of materials (BOM), netlist wiring specifications, and publish interactive preview links.',
  },
]

export function LandingPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <main className="landing-page">
      <LandingNav />
      <HeroCircuitScene />

      {/* 1. CAPABILITIES SECTION */}
      <section className="landing-section" id="capabilities">
        <div className="landing-section__heading">
          <p className="vf-eyebrow">Platform Capabilities</p>
          <h2>One unified platform for modern electronics engineering.</h2>
          <p className="landing-section__subtext">
            Everything you need to design, program, test, and validate embedded systems without needing physical hardware on your desk.
          </p>
        </div>
        <div className="capability-grid">
          {capabilities.map((item) => (
            <CapabilityCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      {/* 2. WORKFLOW SECTION */}
      <section className="landing-section landing-section--workflow" id="workflow">
        <div className="landing-section__heading landing-section__heading--center">
          <p className="vf-eyebrow">Engineering Workflow</p>
          <h2>From idea to simulated circuit in four streamlined steps.</h2>
          <p className="landing-section__subtext">
            A frictionless pipeline designed for rapid prototyping, education, and embedded systems development.
          </p>
        </div>
        <WorkflowStrip steps={workflow} />
      </section>

      {/* 3. WORKSPACE SECTION */}
      <section className="landing-section workspace-preview" id="workspace">
        <div className="landing-section__heading">
          <p className="vf-eyebrow">Cloud Workspace</p>
          <h2>Keep your circuits, firmware, and prototypes organized.</h2>
          <p className="landing-section__subtext">
            Manage your personal electronics projects, explore verified open-source schematics, and level up your skills in Challenge Labs.
          </p>
        </div>
        <MenuPreview />
      </section>

      {/* 4. HIGH-IMPACT PRE-FOOTER CTA BANNER */}
      <section className="landing-cta-banner">
        <div className="landing-cta-banner__content">
          <div className="landing-cta-banner__badge">
            <Sparkles size={14} className="text-teal" />
            <span>Zero Install · 100% In-Browser Simulation</span>
          </div>
          <h2>Ready to bring your circuits to life?</h2>
          <p>
            Start breadboarding, writing firmware, and simulating transient circuits right in your browser in seconds. No breadboards, jumper wires, or USB programmers needed.
          </p>
          <div className="landing-cta-banner__actions">
            <Button
              onClick={() => navigate('/editor/share')}
              size="lg"
              variant="primary"
              icon={<Play size={16} />}
              trailingIcon={<ArrowRight size={16} />}
            >
              Launch Simulator Sandbox
            </Button>
            {!auth.isAuthenticated && (
              <Button
                onClick={auth.signup}
                size="lg"
                variant="secondary"
              >
                Create Free Account
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 5. ENTERPRISE FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer__grid">
          {/* Brand Info */}
          <div className="landing-footer__brand-col">
            <BrandMark />
            <p className="landing-footer__tagline">
              Next-generation cloud electronics workspace for circuit simulation, firmware development, and embedded engineering.
            </p>
            <div className="landing-footer__status">
              <span className="status-dot status-dot--active" />
              <span>All Systems Operational · AVR Engine v2.4</span>
            </div>
          </div>

          {/* Column 1: Platform */}
          <div className="landing-footer__col">
            <h4>Platform</h4>
            <ul>
              <li>
                <Link to="/editor/share">Circuit Canvas Sandbox</Link>
              </li>
              <li>
                <a href="#capabilities">Firmware Studio</a>
              </li>
              <li>
                <Link to="/labs">Challenge Labs</Link>
              </li>
              <li>
                <Link to="/explore">Public Circuit Gallery</Link>
              </li>
              <li>
                <a href="#workflow">BOM & Netlist Export</a>
              </li>
            </ul>
          </div>

          {/* Column 2: Resources & Learning */}
          <div className="landing-footer__col">
            <h4>Resources</h4>
            <ul>
              <li>
                <a href="#preview">Interactive Tour</a>
              </li>
              <li>
                <Link to="/labs">Microcontroller Tutorials</Link>
              </li>
              <li>
                <a href="#workflow">Documentation</a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  GitHub Repository
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Security & Governance */}
          <div className="landing-footer__col">
            <h4>Security</h4>
            <ul>
              <li>
                <span>Guarded by Volt Security Shield</span>
              </li>
              <li>
                <span>256-Bit TLS Enclave</span>
              </li>
              <li>
                <span>Two-Factor Authentication (TOTP)</span>
              </li>
              <li>
                <span>RFC 6238 Compliant</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="landing-footer__bottom">
          <span>© 2026 Voltforge. All rights reserved.</span>
          <div className="landing-footer__meta-tags">
            <span>
              <Cpu size={14} /> 50+ MCUs & Components
            </span>
            <span>
              <Compass size={14} /> Open Schematics
            </span>
            <span>
              <ShieldCheck size={14} /> TLS Encrypted Enclave
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}
