import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity,
  Binary,
  Cable,
  Cpu,
  Crosshair,
  Gauge,
  Grid2X2,
  Maximize2,
  MousePointer2,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Zap,
} from 'lucide-react'
import { PropertyGrid } from '../../components/product'
import { Badge, Button, IconButton, SegmentedControl, Tabs, Terminal, Toolbar } from '../../components/ui'
import { cn } from '../../lib/cn'

type PaletteItem = {
  icon: ReactNode
  label: string
  meta: string
}

type CircuitNode = {
  id: string
  kind: 'board' | 'sensor' | 'output' | 'power'
  label: string
  meta: string
  x: number
  y: number
}

const palette: PaletteItem[] = [
  { icon: <Cpu size={17} />, label: 'Arduino Uno', meta: 'MCU board' },
  { icon: <Gauge size={17} />, label: 'Light sensor', meta: 'Sensor' },
  { icon: <Zap size={17} />, label: 'Relay module', meta: 'Output' },
  { icon: <Binary size={17} />, label: 'Logic probe', meta: 'Debug' },
]

const nodes: CircuitNode[] = [
  { id: 'uno', kind: 'board', label: 'Arduino Uno R3', meta: 'ATmega328P', x: 41, y: 48 },
  { id: 'sensor', kind: 'sensor', label: 'Light sensor', meta: 'A0 signal', x: 16, y: 24 },
  { id: 'relay', kind: 'output', label: 'Relay', meta: 'D8 trigger', x: 70, y: 24 },
  { id: 'power', kind: 'power', label: '5V rail', meta: 'USB power', x: 73, y: 70 },
]

const tabs = [
  { count: 12, id: 'design', label: 'Design' },
  { count: 4, id: 'simulate', label: 'Simulate' },
  { count: 2, id: 'firmware', label: 'Firmware' },
]

const modes = [
  { icon: <MousePointer2 size={15} />, id: 'select', label: 'Select' },
  { icon: <Cable size={15} />, id: 'wire', label: 'Wire' },
  { icon: <Crosshair size={15} />, id: 'probe', label: 'Probe' },
]

const terminalLines = [
  { tone: 'muted' as const, value: '[09:30:02] compiler: sketch.ino loaded' },
  { tone: 'success' as const, value: '[09:30:04] simulation: light sensor signal locked' },
  { value: '[09:30:05] serial: lightLevel=61%' },
  { tone: 'warning' as const, value: '[09:30:06] relay: debounce window raised to 25ms' },
]

export function CircuitPlayground() {
  const [activeNode, setActiveNode] = useState(nodes[0].id)
  const [activeTab, setActiveTab] = useState('design')
  const [mode, setMode] = useState('select')

  const selectedNode = nodes.find((node) => node.id === activeNode) ?? nodes[0]

  return (
    <section className="vf-playground" aria-label="Circuit playground">
      <header className="vf-playground__header">
        <div>
          <p className="vf-eyebrow">Circuit playground</p>
          <h2>Workspace shell for schematic, firmware, and simulation</h2>
        </div>
        <div className="vf-playground__actions">
          <Button icon={<Play size={16} />} variant="primary">
            Run simulation
          </Button>
          <IconButton icon={<Save size={17} />} label="Save project" tone="primary" />
          <IconButton icon={<Maximize2 size={17} />} label="Fullscreen" />
        </div>
      </header>

      <Tabs items={tabs} onChange={setActiveTab} value={activeTab} />

      <div className="vf-playground__grid">
        <aside className="vf-playground__palette" aria-label="Component palette">
          <div className="vf-panel-heading">
            <span>Palette</span>
            <Badge tone="info">4 ready</Badge>
          </div>
          {palette.map((item) => (
            <button className="vf-palette-item" key={item.label} type="button">
              <span>{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.meta}</small>
              </span>
            </button>
          ))}
        </aside>

        <div className="vf-canvas-panel">
          <Toolbar>
            <SegmentedControl onChange={setMode} options={modes} value={mode} />
            <span className="vf-toolbar__divider" />
            <IconButton icon={<Grid2X2 size={16} />} label="Toggle grid" />
            <IconButton icon={<RotateCcw size={16} />} label="Reset view" />
            <IconButton icon={<Settings2 size={16} />} label="Canvas settings" />
          </Toolbar>

          <div className="vf-circuit-canvas">
            <svg className="vf-circuit-wires" role="presentation" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M 43 48 C 35 44, 26 33, 18 28" />
              <path d="M 58 48 C 65 42, 69 34, 72 28" />
              <path d="M 58 58 C 67 61, 73 68, 76 72" />
            </svg>
            {nodes.map((node) => (
              <button
                className={cn('vf-circuit-node', `vf-circuit-node--${node.kind}`, activeNode === node.id && 'is-active')}
                key={node.id}
                onClick={() => setActiveNode(node.id)}
                style={{ '--x': `${node.x}%`, '--y': `${node.y}%` } as CSSProperties}
                type="button"
              >
                <span className="vf-circuit-node__pin" />
                <strong>{node.label}</strong>
                <small>{node.meta}</small>
              </button>
            ))}
            <div className="vf-circuit-probe">
              <Activity size={16} />
              3.31V
            </div>
          </div>
        </div>

        <aside className="vf-playground__inspector" aria-label="Inspector">
          <div className="vf-panel-heading">
            <span>Inspector</span>
            <Badge dot tone="success">
              Linked
            </Badge>
          </div>
          <PropertyGrid
            items={[
              { label: 'Selection', value: selectedNode.label },
              { label: 'Mode', value: mode },
              { label: 'Pin map', value: selectedNode.id === 'uno' ? 'D2, D8, 5V, GND' : selectedNode.meta },
              { label: 'Rule check', value: 'No blocking errors' },
            ]}
          />
          <div className="vf-inspector-callout">
            <span>Verify terminal outputs and watch signal waves on the oscilloscope grid below.</span>
          </div>
        </aside>
      </div>

      <div className="vf-playground__bottom">
        <Terminal lines={terminalLines} />
        <div className="vf-scope">
          <header>
            <span>Oscilloscope</span>
            <Badge tone="success">Live</Badge>
          </header>
          <div className="vf-scope__screen">
            <svg viewBox="0 0 320 100" preserveAspectRatio="none">
              <polyline points="0,55 24,55 38,28 58,76 78,55 116,55 130,24 150,78 170,55 210,55 224,31 244,73 264,55 320,55" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
