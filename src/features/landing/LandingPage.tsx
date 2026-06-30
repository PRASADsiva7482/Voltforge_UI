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
import { CapabilityCard, HeroCircuitScene, LandingNav, WorkflowStrip } from '../../components/landing'

const capabilities = [
  { icon: CircuitBoard, label: 'Circuit Editor', text: 'Interactive canvas for placing boards, components, and custom wiring.' },
  { icon: Code2, label: 'Firmware Studio', text: 'Write, compile, and debug microcontroller sketch code directly in the app.' },
  { icon: Gauge, label: 'Signal Simulation', text: 'Run real-time electrical transient solvers and inspect GPIO waveforms.' },
  { icon: PackageCheck, label: 'BOM Exports', text: 'Generate precise parts lists and export files for physical production.' },
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
          <h2>Go from schematic to production in four steps.</h2>
        </div>
        <WorkflowStrip steps={workflow} />
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
