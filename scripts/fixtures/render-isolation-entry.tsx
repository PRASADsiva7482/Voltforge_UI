import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import Konva from 'konva'
import CircuitCanvas from '../../src/features/canvas/CircuitCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { useSimulationStore } from '../../src/store/simulationStore'
import { useThemeStore } from '../../src/store/themeStore'
import { createCanvasNodeFromComponent } from '../../src/features/canvas/componentFactory'
import { builtinCanvasComponents } from '../../src/features/canvas/componentCatalog'
import { getWireRenderPoints } from '../../src/utils/wireRouting'
import '../../src/index.css'
import '../../src/styles/editor.css'

const audit = window.__renderAudit
Object.assign(audit, { store: useCanvasStore, simulation: useSimulationStore, theme: useThemeStore, Konva, getWireRenderPoints })
const resistor = builtinCanvasComponents.find(c => c.type === 'RESISTOR')!
audit.load = () => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({ ...createCanvasNodeFromComponent(resistor, { x: 80 + i % 10 * 120, y: 80 + Math.floor(i / 10) * 100 }), id: `r-${i}` }))
  const wires = nodes.slice(1).map((node, i) => ({ id: `w-${i}`, fromNodeId: nodes[i].id, fromPinId: 'p2', toNodeId: node.id, toPinId: 'p1', color: '#22c55e', routingMode: 'auto' as const, bendPoints: [] }))
  useCanvasStore.getState().loadCanvas(nodes, wires, { x: 0, y: 0, scale: .65 })
}
export default function Fixture() {
  const [probe, setProbe] = useState(false), [readOnly, setReadOnly] = useState(false)
  Object.assign(audit, { setProbe, setReadOnly })
  return <CircuitCanvas width={1280} height={700} isProbeMode={probe} readOnly={readOnly} />
}
createRoot(document.getElementById('root')!).render(<Fixture />)
