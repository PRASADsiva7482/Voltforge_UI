import { StrictMode, useState, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import PcbCanvas from '../../src/features/pcb/PcbCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { usePcbStore } from '../../src/store/pcbStore'
import { createRatlineFixture } from './ratline-fixture.mjs'
import '../../src/index.css'
import '../../src/styles/editor.css'
const audit = window.__pcbSceneAudit
audit.canvas = useCanvasStore; audit.pcb = usePcbStore; audit.Konva = Konva
audit.load = (mode = 'dense') => {
  const f = createRatlineFixture(mode === 'dense' ? 512 : 128, mode === 'dense' ? 1 : 8)
  if (mode === 'mixed') {
    f.traces = f.footprints.map((fp, i) => ({ id: `t${i}`, netId: 'fixture', layer: i % 2 ? 'B.Cu' : 'F.Cu', width_mm: .25, points: [{ x: fp.x - 2, y: fp.y + 3 }, { x: fp.x + 2, y: fp.y + 3 }] }))
    f.vias = f.footprints.map((fp, i) => ({ id: `v${i}`, x: fp.x + 3, y: fp.y + 2, drill_mm: .3, pad_mm: .6 }))
    f.traces.push({ id: 'crossing', netId: 'fixture', layer: 'F.Cu', width_mm: .25, points: [{ x: -100, y: 35 }, { x: 400, y: 35 }] })
  }
  audit.fixture = f
  useCanvasStore.getState().loadCanvas(f.nodes, f.wires)
  usePcbStore.getState().loadPcb(f)
}
audit.load()
export default function Fixture() {
  const [mounted, setMounted] = useState(true), [readOnly, setReadOnly] = useState(false)
  audit.setMounted = setMounted; audit.setReadOnly = setReadOnly
  return mounted ? <Profiler id="pcb" onRender={(_id, _phase, actualDuration) => audit.commits.push(actualDuration)}><PcbCanvas width={1200} height={740} readOnly={readOnly} projectName="PCB scene fixture" /></Profiler> : null
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
