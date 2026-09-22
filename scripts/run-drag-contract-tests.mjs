import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)), checks=[],workers=[],frames=new Map()
let nextFrame=0,store
const originals={Worker:globalThis.Worker,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame}
globalThis.requestAnimationFrame=callback=>{frames.set(++nextFrame,callback);return nextFrame}
globalThis.cancelAnimationFrame=id=>frames.delete(id)
const frame=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(0))}
globalThis.Worker=class {constructor(){workers.push(this)}postMessage(payload){this.payload=structuredClone(payload)}terminate(){this.stopped=true}emit(data){this.onmessage?.({data})}}
const server=await createServer({root,appType:'custom',logLevel:'error',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]}})
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});console.log('PASS '+name)}
try {
  store=(await server.ssrLoadModule('/src/store/canvasStore.ts')).useCanvasStore
  const {createCanvasRouteCache,isCanvasRouteCacheValid}=await server.ssrLoadModule('/src/features/canvas/canvasRouteCache.ts')
  const {affectedDragRoutes,indexIncidentWires}=await server.ssrLoadModule('/src/features/canvas/dragRouting.ts')
  const {routeWireBetweenNodes}=await server.ssrLoadModule('/src/utils/wireRouting.ts')
  const node=(id,x,y)=>({id,type:'RESISTOR',x,y})
  const nodes=[node('a',100,100),node('b',400,100),node('c',100,800),node('d',400,800),node('obstacle',250,450),node('boundary-min',0,0),node('boundary-max',1000,1000)]
  const wire=(id,from,to,mode='auto')=>({id,fromNodeId:from,fromPinId:'p2',toNodeId:to,toPinId:'p1',routingMode:mode,color:'#22c55e',bendPoints:mode==='auto'?[]:[{x:160,y:230}]})
  const wires=[wire('near','a','b'),wire('far','c','d'),wire('manual','a','b','curved')]
  const complete=worker=>{
    const {nodes,wires,previousNodes}=worker.payload, affected=affectedDragRoutes(nodes,wires,previousNodes)
    const routed=wires.map(w=>affected.has(w.id)?{...w,bendPoints:routeWireBetweenNodes(w,nodes)}:w)
    worker.emit({type:'complete',wires:routed,routeCache:createCanvasRouteCache(nodes,routed)})
    return affected
  }
  const load=()=>{store.getState().loadCanvas(nodes,wires);complete(workers.at(-1))}
  await check('1000 queued moves produce one geometry publication and no wire publication or routing job',()=>{
    load();const before=store.getState();store.getState().beginNodeGesture('a');let publications=0
    const count=workers.length,unsubscribe=store.subscribe(()=>publications++)
    for(let i=0;i<1000;i++)store.getState().queueNodeGesture('a',{x:120+i/100})
    assert.equal(publications,0);assert.equal(frames.size,1);frame();unsubscribe()
    assert.equal(publications,1);assert.equal(store.getState().nodes[0].x,129.99)
    assert.equal(store.getState().wires,before.wires);assert.equal(workers.length,count)
    assert.equal(store.getState().historyIndex,before.historyIndex+1)
  })
  await check('Release flushes the newest position and ignores an older queued frame',()=>{
    store.getState().queueNodeGesture('a',{x:180,y:130});store.getState().endNodeGesture('a',{x:190,y:140})
    assert.equal(frames.size,0);frame();assert.equal(store.getState().nodes[0].x,190)
    assert.equal(workers.at(-1).payload.nodes[0].y,140);assert(workers.at(-1).payload.previousNodes)
    const state=store.getState();complete(workers.at(-1));assert.equal(store.getState().localDocumentRevision,state.localDocumentRevision);assert.equal(store.getState().modelRevision,state.modelRevision)
  })
  await check('One gesture has one undo entry and redo restores final geometry and routes',async()=>{
    const final=store.getState(), x=final.nodes[0].x
    store.getState().undo();assert.equal(store.getState().nodes[0].x,100)
    store.getState().redo();await Promise.resolve();if(store.getState().routingStatus.phase==='routing')complete(workers.at(-1))
    assert.equal(store.getState().nodes[0].x,x);assert.deepEqual(store.getState().wires,final.wires)
  })
  await check('Identical geometry and no-op gestures do not revise, route, or add history',()=>{
    load();const before=store.getState(),count=workers.length
    store.getState().updateNode('a',{x:100,y:100,pins:structuredClone(before.nodes[0].pins)})
    store.getState().updateNodeDragEnd('a',{x:100,y:100});assert.equal(store.getState(),before)
    store.getState().beginNodeGesture('a');store.getState().queueNodeGesture('a',{x:100});frame();store.getState().endNodeGesture('a',{x:100})
    assert.equal(store.getState().documentRevision,before.documentRevision);assert.equal(store.getState().historyIndex,before.historyIndex);assert.equal(workers.length,count)
  })
  await check('Incident adjacency and conservative obstacle corridors exclude distant routes',()=>{
    load();const before=store.getState(),adj=indexIncidentWires(before.wires)
    assert.deepEqual(adj.get('a'),[0,2]);assert.deepEqual(adj.get('c'),[1])
    store.getState().beginNodeGesture('obstacle');store.getState().endNodeGesture('obstacle',{y:100})
    const worker=workers.at(-1),affected=complete(worker)
    assert(affected.has('near'));assert(!affected.has('far'));assert(!affected.has('manual'))
    assert.equal(store.getState().wires[1],before.wires[1]);assert.equal(store.getState().wires[2],before.wires[2])
    assert.deepEqual(store.getState().wires[0].bendPoints,routeWireBetweenNodes(store.getState().wires[0],store.getState().documentNodes))
    assert(isCanvasRouteCacheValid(store.getState().routeCache,store.getState().documentNodes,store.getState().wires))
    // Moving the obstruction away must also invalidate the detour.
    store.getState().beginNodeGesture('obstacle');store.getState().endNodeGesture('obstacle',{y:450});assert(complete(workers.at(-1)).has('near'))
  })
  await check('Grid-bound changes, unknown layouts and changed endpoints safely recompute',()=>{
    load();const state=store.getState(),moved=structuredClone(state.documentNodes);moved[0].x=150
    assert(affectedDragRoutes(moved,state.wires,state.documentNodes).has('near'))
    moved.at(-1).x=1500;assert.equal(affectedDragRoutes(moved,state.wires,state.documentNodes).size,2)
    assert.equal(affectedDragRoutes(state.documentNodes,state.wires).size,2)
  })
  await check('Runtime feedback survives a gesture and stays out of history and saved geometry',()=>{
    load();store.getState().beginNodeGesture('a');store.getState().updateRuntimeNode('a',{properties:{feedback:42}})
    store.getState().queueNodeGesture('a',{x:170});frame();store.getState().endNodeGesture('a',{x:180});complete(workers.at(-1))
    const state=store.getState();assert.equal(state.nodes[0].properties.feedback,42);assert.equal(state.documentNodes[0].properties.feedback,undefined)
    assert.equal(state.history.at(-1).nodes[0].properties.feedback,undefined)
  })
  await check('Replacement with the same node IDs cancels queued geometry and rejects stale gesture completion',()=>{
    load();store.getState().beginNodeGesture('a');store.getState().queueNodeGesture('a',{x:700})
    store.getState().loadCanvas(nodes.map(n=>n.id==='a'?{...n,x:990}:n),wires)
    frame();store.getState().endNodeGesture('a',{x:800});assert.equal(store.getState().nodes[0].x,990);assert.equal(store.getState().draggingNodeId,null);complete(workers.at(-1))
  })
  await check('Undo during a pending job ignores its late routes and cancels queued gesture writes',async()=>{
    load();store.getState().beginNodeGesture('a');store.getState().endNodeGesture('a',{x:175});const worker=workers.at(-1)
    store.getState().undo();await Promise.resolve();assert(worker.stopped);complete(worker);assert.equal(store.getState().nodes[0].x,100)
    complete(workers.at(-1));assert.equal(store.getState().routingStatus.phase,'ready')
  })
  await check('Worker failure retains final geometry and retry recovers equivalent routing',()=>{
    load();store.getState().beginNodeGesture('a');store.getState().endNodeGesture('a',{x:210});workers.at(-1).onerror()
    assert.equal(store.getState().nodes[0].x,210);assert.equal(store.getState().routingStatus.phase,'error')
    store.getState().retryCanvasRouting();assert.equal(workers.at(-1).payload.previousNodes,undefined);complete(workers.at(-1))
    assert.equal(store.getState().routingStatus.phase,'ready')
  })
  await check('Breadboard gesture commits one topology revision; frames and derived routing add none',()=>{
    store.getState().loadCanvas([...nodes,{id:'board',type:'BREADBOARD',x:400,y:300}],wires);complete(workers.at(-1))
    const revision=store.getState().modelRevision;store.getState().beginNodeGesture('a')
    for(let i=0;i<5;i++){store.getState().queueNodeGesture('a',{x:410+i,y:320});frame()}
    assert.equal(store.getState().modelRevision,revision)
    store.getState().endNodeGesture('a',{x:414,y:320});assert.equal(store.getState().modelRevision,revision+1)
    assert.equal(store.getState().lastModelChange.topologyChanged,true);complete(workers.at(-1));assert.equal(store.getState().modelRevision,revision+1)
  })
  await check('Locked nodes reject gestures and cancellation discards an unpainted frame',()=>{
    load();store.getState().updateNode('a',{properties:{locked:true}});const before=store.getState()
    store.getState().beginNodeGesture('a');store.getState().queueNodeGesture('a',{x:800});frame();assert.equal(store.getState().nodes[0],before.nodes[0])
    store.getState().beginNodeGesture('b');store.getState().queueNodeGesture('b',{x:900});store.getState().cancelNodeGesture('b');frame()
    assert.equal(store.getState().nodes[1].x,400);assert.equal(store.getState().draggingNodeId,null)
  })
  await check('Breadboard pin connectivity changes on release and is restored by undo',async()=>{
    const {buildMNACircuit}=await server.ssrLoadModule('/src/features/simulator/NetlistBuilder.ts')
    store.getState().loadCanvas([{id:'board',type:'BREADBOARD',x:0,y:0},{id:'part',type:'RESISTOR',x:15,y:28}],[])
    const build=()=>buildMNACircuit(store.getState().documentNodes,store.getState().wires,{},{},{})
    const connected=build();assert.equal(connected.pinToMNANode.get('board:a1'),connected.pinToMNANode.get('part:p1'))
    store.getState().beginNodeGesture('part');store.getState().queueNodeGesture('part',{y:108});frame();store.getState().endNodeGesture('part',{y:108})
    const detached=build();assert.notEqual(detached.pinToMNANode.get('board:a1'),detached.pinToMNANode.get('part:p1'))
    store.getState().undo();const restored=build();assert.equal(restored.pinToMNANode.get('board:a1'),restored.pinToMNANode.get('part:p1'))
  })
  await check('Rotation and resize preserve pin identities, manual bends and one-gesture undo',()=>{
    load();const before=store.getState(),part=before.nodes[0]
    store.getState().beginNodeGesture('a');store.getState().endNodeGesture('a',{rotation:90,width:part.width*2,height:part.height*2,pins:part.pins.map(p=>({...p,x:p.x*2,y:p.y*2}))})
    complete(workers.at(-1));const final=store.getState()
    assert.deepEqual(final.nodes[0].pins.map(p=>p.id),part.pins.map(p=>p.id));assert.deepEqual(final.wires[2],before.wires[2])
    assert.deepEqual(final.wires[0].bendPoints,routeWireBetweenNodes(final.wires[0],final.documentNodes))
    store.getState().undo();assert.deepEqual(store.getState().nodes[0],part)
  })
} finally {
  store?.getState().cancelCanvasRouting();Object.assign(globalThis,originals);await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-017-drag-contract-tests.json',import.meta.url),JSON.stringify({task:'VFOPT-UI-017',capturedAt:new Date().toISOString(),status:checks.length===14?'passed':'failed',checks},null,2)+'\n')
}
