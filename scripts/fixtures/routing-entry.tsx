// UI-016 fixture entry: actual canvas/store; no backend or owner data writes.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CircuitCanvas from '../../src/features/canvas/CircuitCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { createCanvasNodeFromComponent } from '../../src/features/canvas/componentFactory'
import { builtinCanvasComponents } from '../../src/features/canvas/componentCatalog'
import { routeWireBetweenNodes } from '../../src/utils/wireRouting'
import '../../src/index.css'
import '../../src/styles/components.css'
import '../../src/styles/editor.css'

const resistor = builtinCanvasComponents.find(component => component.type === 'RESISTOR')!
const nodes = Array.from({ length: 100 }, (_, i) => ({ ...createCanvasNodeFromComponent(resistor, { x: 80 + i % 10 * 120, y: 80 + Math.floor(i / 10) * 100 }), id: `r-${i}` }))
const wires = nodes.slice(1).map((node, i) => ({ id: `w-${i}`, fromNodeId: nodes[i].id, fromPinId: 'p2', toNodeId: node.id, toPinId: 'p1', color: '#22c55e', routingMode: 'auto', bendPoints: [] }))
const fixture = { nodes, wires, viewport: { x: 0, y: 0, scale: 0.65 } }
const audit = window.__routingAudit
audit.fixture = fixture
audit.store = useCanvasStore
audit.route = routeWireBetweenNodes
audit.load = (layout = fixture) => {
  const started = performance.now()
  useCanvasStore.getState().loadCanvas(layout.nodes, layout.wires, layout.viewport, layout.routeCache)
  audit.lastLoadMs = performance.now() - started
}
export default function Fixture() {
  const [clicks, setClicks] = useState(0)
  return <>
    <button onClick={() => audit.load()}>Load routing fixture</button>
    <button onClick={() => setClicks(count => count + 1)}>Interaction probe {clicks}</button>
    <CircuitCanvas width={1280} height={650} />
  </>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
