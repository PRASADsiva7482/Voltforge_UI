import {
  Braces,
  CircuitBoard,
  Code2,
  Compass,
  Cpu,
  FileOutput,
  Gauge,
  PackageCheck,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { CapabilityCard, HeroCircuitScene, LandingNav, MenuPreview, WorkflowStrip } from '../../components/landing'

const capabilities = [
  { icon: CircuitBoard, label: 'Circuit Editor', text: 'Interactive canvas for placing boards, components, and custom wiring.' },
  { icon: Code2, label: 'Firmware Studio', text: 'Write, compile, and debug microcontroller sketch code directly in the app.' },
  { icon: Gauge, label: 'Signal Simulation', text: 'Run real-time electrical transient solvers and inspect GPIO waveforms.' },
  { icon: PackageCheck, label: 'BOM Exports', text: 'Review your parts list and export your project for the next stage.' },
]

const workflow = [
  { icon: CircuitBoard, label: 'Wire Schematic' },
  { icon: Braces, label: 'Write Code' },
  { icon: Play, label: 'Simulate' },
  { icon: FileOutput, label: 'Export' },
]

export function LandingPage() {
  return (
    <main className="landing-page">
      <LandingNav />
      <HeroCircuitScene />

      <section className="landing-section" id="capabilities">
        <div className="landing-section__heading">
          <p className="vf-eyebrow">Capabilities</p>
          <h2>One unified platform for electronics development.</h2>
        </div>
        <div className="capability-grid">
          {capabilities.map((item) => (
            <CapabilityCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="landing-section landing-section--split" id="workflow">
        <div>
          <p className="vf-eyebrow">Workflow</p>
          <h2>Design, code, test, and export.</h2>
        </div>
        <WorkflowStrip steps={workflow} />
      </section>

      <section className="landing-section workspace-preview" id="workspace">
        <div className="landing-section__heading">
          <p className="vf-eyebrow">Workspace</p>
          <h2>Keep your circuits and ideas together.</h2>
          <p>Create projects, explore community circuits, and practice with guided labs.</p>
        </div>
        <MenuPreview />
      </section>

      <footer className="landing-footer">
        <span>
          <Cpu size={16} />
          MCUs & components
        </span>
        <span>
          <Compass size={16} />
          Open schematics
        </span>
        <span>
          <ShieldCheck size={16} />
          Secure projects
        </span>
      </footer>
    </main>
  )
}
