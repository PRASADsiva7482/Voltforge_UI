// Isolated UI-012 browser fixture; not part of the application entry graph.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ComponentPanel from '../../src/features/editor/ComponentPanel'
import { builtinCanvasComponents } from '../../src/features/canvas/componentCatalog'
import { useCanvasStore } from '../../src/store/canvasStore'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/styles/components.css'
import '../../src/styles/editor.css'

const categories = ['BOARD', 'PASSIVE', 'LOGIC', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER', 'INSTRUMENT']
const catalogue = [...builtinCanvasComponents, ...Array.from({ length: 1000 - builtinCanvasComponents.length }, (_, i) => ({
  id: `fixture-${i}`, name: `Fixture component ${String(i).padStart(4, '0')}`, type: `CUSTOM_FIXTURE_${String(i).padStart(4, '0')}`,
  category: categories[i % categories.length], sortOrder: i, description: `Searchable description token${String(i).padStart(4, '0')}`,
  defaultProperties: { customTag: i }, isPremium: i % 5 === 0, createdAt: '',
}))]
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } })
client.setQueryData(['components'], catalogue)
const coverage = { entries: [{ componentType: 'RESISTOR', status: 'verified', reason: 'Fixture coverage reason' }], summary: { verified: 1, variantRequired: 0, simulationOnly: 0 } }
client.setQueryData(['ai', 'component-coverage'], coverage)
useCanvasStore.getState().loadCanvas([{ id: 'runtime-led', type: 'LED_STANDARD', name: 'LED', componentId: 'catalog_led', x: 10, y: 10, width: 40, height: 40, rotation: 0, properties: { isLit: false }, pins: [] }], [], { x: 0, y: 0, scale: 1 })

function Fixture() {
  const [readOnly, setReadOnly] = useState(false)
  window.__paletteAudit.store = useCanvasStore
  window.__paletteAudit.queryClient = client
  window.__paletteAudit.catalogue = catalogue
  window.__paletteAudit.coverage = coverage
  window.__paletteAudit.setReadOnly = setReadOnly
  return <div style={{ width: 272, height: '100vh' }}><ComponentPanel readOnly={readOnly} /></div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><Fixture /></QueryClientProvider></StrictMode>)
