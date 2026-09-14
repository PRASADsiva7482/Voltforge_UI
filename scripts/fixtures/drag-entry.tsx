import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import Konva from 'konva'
import CircuitCanvas from '../../src/features/canvas/CircuitCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { createCanvasNodeFromComponent } from '../../src/features/canvas/componentFactory'
import { builtinCanvasComponents } from '../../src/features/canvas/componentCatalog'
import { routeWireBetweenNodes } from '../../src/utils/wireRouting'
import '../../src/index.css'
import '../../src/styles/editor.css'

const resistor = builtinCanvasComponents.find(component => component.type === 'RESISTOR')!
const nodes = Array.from({ length: 100 }, (_, i) => ({ ...createCanvasNodeFromComponent(resistor, { x: 80 + i % 10 * 120, y: 80 + Math.floor(i / 10) * 100 }), id: `r-${i}` }))
const wires = nodes.slice(1).map((node, i) => ({ id: `w-${i}`, fromNodeId: nodes[i].id, fromPinId: 'p2', toNodeId: node.id, toPinId: 'p1', color: '#22c55e', routingMode: 'auto' as const, bendPoints: [] }))
const fixture = { nodes, wires, viewport: { x: 0, y: 0, scale: 0.65 } }
const audit = window.__dragAudit
audit.fixture = fixture
audit.store = useCanvasStore
audit.Konva = Konva
audit.route = routeWireBetweenNodes
audit.load = () => useCanvasStore.getState().loadCanvas(fixture.nodes, fixture.wires, fixture.viewport)
export default function Fixture() {
  const [mounted, setMounted] = useState(true), [readOnly, setReadOnly] = useState(false)
  audit.setMounted = setMounted; audit.setReadOnly = setReadOnly
  return <>{mounted && <CircuitCanvas width={1280} height={700} readOnly={readOnly} />}</>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
