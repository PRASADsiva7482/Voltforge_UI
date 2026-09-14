import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import PcbCanvas from '../../src/features/pcb/PcbCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { usePcbStore } from '../../src/store/pcbStore'
import { RatlineEngine } from '../../src/features/pcb/RatlineEngine'
import { createRatlineFixture } from './ratline-fixture.mjs'
import '../../src/index.css'
import '../../src/styles/editor.css'
const audit = window.__ratlineAudit
audit.canvas = useCanvasStore; audit.pcb = usePcbStore; audit.Konva = Konva
audit.computeTimes = []
const compute = RatlineEngine.computeRatlines
RatlineEngine.computeRatlines = (...args) => {
  const started = performance.now(), result = compute(...args)
  audit.computeTimes.push({ ms: performance.now() - started, pads: args[2].reduce((sum, fp) => sum + fp.pads.length, 0) })
  return result
}
audit.load = (pads = 128, nets = 1) => {
  audit.fixture = createRatlineFixture(pads, nets)
  useCanvasStore.getState().loadCanvas(audit.fixture.nodes, audit.fixture.wires)
  usePcbStore.getState().loadPcb(audit.fixture)
}
audit.load()
export default function Fixture() {
  const [mounted, setMounted] = useState(true), [readOnly, setReadOnly] = useState(false)
  audit.setMounted = setMounted; audit.setReadOnly = setReadOnly
  return mounted ? <PcbCanvas width={1200} height={740} projectName="Ratline scalability fixture" readOnly={readOnly} /> : null
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
