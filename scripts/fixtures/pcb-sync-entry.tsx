import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PcbCanvas from '../../src/features/pcb/PcbCanvas'
import { useCanvasStore } from '../../src/store/canvasStore'
import { usePcbStore } from '../../src/store/pcbStore'
import { RatlineEngine } from '../../src/features/pcb/RatlineEngine'
import { captureEditorDocument } from '../../src/features/editor/editorDocumentSnapshots'
import '../../src/index.css'
import '../../src/styles/editor.css'
const audit=window.__pcbSyncAudit
audit.canvas=useCanvasStore;audit.pcb=usePcbStore;audit.capture=captureEditorDocument
const compute=RatlineEngine.computeRatlines
RatlineEngine.computeRatlines=(...args)=>{audit.ratlineComputations++;return compute(...args)}
audit.nodes=Array.from({length:100},(_,i)=>({id:`led-${i}`,type:'LED_STANDARD',name:`LED ${i}`,x:60+(i%10)*70,y:60+Math.floor(i/10)*80}))
audit.wires=audit.nodes.slice(1).map((node,i)=>({id:`net-${i}`,fromNodeId:`led-${i}`,fromPinId:'cathode',toNodeId:node.id,toPinId:'anode',routingMode:'curved',color:'#22c55e',bendPoints:[{x:80,y:80}]}))
useCanvasStore.getState().loadCanvas(audit.nodes,audit.wires)
usePcbStore.getState().resetPcb()
export default function Fixture(){const [mounted,setMounted]=useState(true),[readOnly,setReadOnly]=useState(false);audit.setMounted=setMounted;audit.setReadOnly=setReadOnly;return mounted?<PcbCanvas width={1200} height={740} readOnly={readOnly} projectName="PCB sync fixture"/>:null}
createRoot(document.getElementById('root')!).render(<Fixture/> )
