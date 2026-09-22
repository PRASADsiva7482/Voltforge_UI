import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import Konva from 'konva'
import CircuitCanvas from '../../src/features/canvas/CircuitCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { useSimulationStore } from '../../src/store/simulationStore'
import { AudioEngine } from '../../src/features/simulator/AudioEngine'
import { createCanvasNodeFromComponent } from '../../src/features/canvas/componentFactory'
import { builtinCanvasComponents } from '../../src/features/canvas/componentCatalog'
import '../../src/index.css'
import '../../src/styles/editor.css'

const audit = window.__componentSceneAudit
const resistor = builtinCanvasComponents.find(c => c.type === 'RESISTOR')!
audit.store = useCanvasStore
audit.simulation = useSimulationStore
audit.Konva = Konva
audit.makeNode = (type: string, id: string, x: number, y: number) => ({ ...createCanvasNodeFromComponent(builtinCanvasComponents.find(c => c.type === type)!, { x, y }), id })
audit.audio = []
AudioEngine.playTone = (...args) => { audit.audio.push(['tone', ...args]) }
AudioEngine.stopTone = () => { audit.audio.push(['stop']) }
AudioEngine.playClick = (...args) => { audit.audio.push(['click', ...args]) }
audit.load = (count = 500) => {
  const nodes = Array.from({ length: count }, (_, i) => ({
    ...createCanvasNodeFromComponent(resistor, { x: 80 + i % 25 * 220, y: 80 + Math.floor(i / 25) * 180 }), id: `r-${i}`,
  }))
  const wires = nodes.slice(1).map((node, i) => ({ id: `w-${i}`, fromNodeId: nodes[i].id, fromPinId: 'p2', toNodeId: node.id, toPinId: 'p1', color: '#22c55e', routingMode: 'straight' as const, bendPoints: [] }))
  useCanvasStore.getState().loadCanvas(nodes, wires, { x: 0, y: 0, scale: 1 })
  useSimulationStore.getState().clearMeterProbes()
}
export default function Fixture() {
  const [readOnly, setReadOnly] = useState(false), [isSimulating, setSimulating] = useState(false)
  const [isProbeMode, setProbeMode] = useState(false), [viewMode, setViewMode] = useState<'breadboard' | 'pcb'>('breadboard')
  const [mounted, setMounted] = useState(true)
  Object.assign(audit, { setReadOnly, setSimulating, setProbeMode, setViewMode, setMounted })
  return mounted && <CircuitCanvas width={1280} height={700} readOnly={readOnly} isSimulating={isSimulating} isProbeMode={isProbeMode} viewMode={viewMode} onProbeToggle={useSimulationStore.getState().toggleMeterProbe} />
}
audit.load()
createRoot(document.getElementById('root')!).render(<Fixture />)
