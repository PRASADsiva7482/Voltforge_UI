import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3107'
const phase = process.argv.includes('--before') ? 'before' : 'after', checks = [], samples = [], errors = []
const ui014Baseline = process.argv.includes('--ui014-baseline')
const reportName = ui014Baseline ? 'vfopt-ui-014-drag-baseline' : `vfopt-ui-017-drag-${phase}`
const output = path.join(root, 'docs/reports'), sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let browser
const server = await createServer({ root, server: { host: 'localhost', port: 3107, strictPort: true }, plugins: [{ name: 'drag-fixture', enforce: 'pre', transform(source, id) {
  const file = path.relative(root, id).replaceAll('\\', '/')
  if (ui014Baseline && ['src/features/canvas/CircuitCanvas.tsx', 'src/features/canvas/components/ComponentNode.tsx', 'src/features/canvas/components/PinDot.tsx'].includes(file)) {
    return fs.readFileSync(path.join(root, 'node_modules/.cache/vfopt-ui-014/before', file), 'utf8')
  }
  return source
}, configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.headers.accept?.includes('text/html')) return next()
    response.setHeader('Content-Type', 'text/html')
    response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html><head><title>Drag audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/drag-entry.tsx"></script></body></html>'))
  })
} }] })
async function check(name, fn) { try { await fn(); checks.push({name,passed:true}); console.log('PASS '+name) } catch(e) { checks.push({name,passed:false,error:e.message}); console.error('FAIL '+name+': '+e.message) } }
try {
  await server.listen(); browser = await chromium.launch({channel:'chrome',headless:true})
  const context = await browser.newContext({viewport:{width:1366,height:768}})
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await context.addInitScript(() => { window.__dragAudit = {events:[]} })
  const page = await context.newPage(); page.on('pageerror', e=>errors.push(e.message)); page.setDefaultTimeout(20000)
  await page.goto(origin,{waitUntil:'networkidle'})
  await page.evaluate(() => window.__dragAudit.load())
  await page.waitForFunction(() => window.__dragAudit.store.getState().routingStatus.phase === 'ready')
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    const a=window.__dragAudit, stage=a.Konva.stages[0], layer=stage.getLayers()[1]
    a.layer=layer; a.lastMove=0; a.latencies=[]; a.geometryPublications=0; a.wirePublications=0
    document.addEventListener('mousemove', e=>{if(e.buttons===1){a.lastMove=performance.now();a.events.push({at:a.lastMove,x:e.clientX,y:e.clientY})}},true)
    layer.on('draw.drag-audit',()=>{if(a.lastMove){a.latencies.push(performance.now()-a.lastMove);a.lastMove=0}})
    a.unsubscribe=a.store.subscribe((state,previous)=>{if(state.documentNodes!==previous.documentNodes)a.geometryPublications++;if(state.wires!==previous.wires)a.wirePublications++})
  })
  // Actual mouse gesture across 30 separately painted positions, including final mouseup.
  await page.mouse.move(76,60); await page.mouse.down(); await page.mouse.move(84,68)
  for(let i=0;i<30;i++) { await page.mouse.move(90+i*3,75+i*2); await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))) }
  await page.mouse.up()
  await page.waitForFunction(() => ['ready','idle'].includes(window.__dragAudit.store.getState().routingStatus.phase))
  await page.waitForTimeout(150)
  samples.push(await page.evaluate(()=>{const a=window.__dragAudit;return {name:'actual mouse drag',latencies:a.latencies,events:a.events.length,geometryPublications:a.geometryPublications,wirePublications:a.wirePublications,node:a.store.getState().nodes[0],viewport:a.store.getState().viewport,historyIndex:a.store.getState().historyIndex}}))
  await check('Real component drag moves the component and preserves the viewport', async()=>{
    assert(samples[0].node.x!==80);assert.deepEqual(samples[0].viewport,{x:0,y:0,scale:0.65})
  })
  if(phase==='after') {
    await check('Drag previews preserve wires and the final worker preserves endpoints and equivalent routes',async()=>{
      assert.equal(samples[0].wirePublications,1)
      const result=await page.evaluate(()=>{const a=window.__dragAudit,s=a.store.getState();a.finalDrag=structuredClone({nodes:s.documentNodes,wires:s.wires});return {actual:s.wires.map(w=>w.bendPoints),expected:s.wires.map(w=>a.route(w,s.documentNodes)),connections:s.wires.map(w=>[w.fromNodeId,w.fromPinId,w.toNodeId,w.toPinId]),original:a.fixture.wires.map(w=>[w.fromNodeId,w.fromPinId,w.toNodeId,w.toPinId])}})
      assert.deepEqual(result.actual,result.expected);assert.deepEqual(result.connections,result.original)
    })
    await check('Browser undo and redo restore exactly one completed gesture',async()=>{
      await page.evaluate(()=>window.__dragAudit.store.getState().undo())
      assert.equal(await page.evaluate(()=>window.__dragAudit.store.getState().nodes[0].x),80)
      await page.evaluate(()=>window.__dragAudit.store.getState().redo())
      const result=await page.evaluate(()=>{const a=window.__dragAudit,s=a.store.getState();return {nodes:s.documentNodes,wires:s.wires,expected:a.finalDrag}})
      assert.deepEqual(result.nodes,result.expected.nodes);assert.deepEqual(result.wires,result.expected.wires)
    })
  }
  for(let i=0;i<5;i++) {
    samples.push(await page.evaluate(i=>{const a=window.__dragAudit,s=a.store.getState(),start=performance.now();s.updateNodeDragEnd('r-0',{x:180+i*10,y:180});return{name:'drag end dispatch',ms:performance.now()-start}},i))
    await page.waitForFunction(()=>['ready','idle','error'].includes(window.__dragAudit.store.getState().routingStatus.phase))
  }
  if(phase==='after') {
    await check('Drag-end dispatch stays below 50 ms',async()=>assert(samples.filter(s=>s.name==='drag end dispatch').every(s=>s.ms<50)))
    await check('Mouse-to-canvas-draw p95 stays below 50 ms on the dense fixture',async()=>{const x=[...samples[0].latencies].sort((a,b)=>a-b);assert(x.length>=20);assert(x[Math.ceil(x.length*.95)-1]<=50)})
    await check('Actual Konva event bursts coalesce to one frame and release keeps the newest coordinates',async()=>{
      await page.evaluate(()=>{const a=window.__dragAudit,g=a.Konva.stages[0].getLayers()[1].getChildren()[0];a.burstGroup=g;a.burstPublications=a.geometryPublications;g.fire('dragstart',{evt:{}},true);for(let i=0;i<100;i++){g.position({x:280+i,y:160});g.fire('dragmove',{evt:{}},true)}})
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.equal(await page.evaluate(()=>window.__dragAudit.geometryPublications-window.__dragAudit.burstPublications),1)
      await page.evaluate(()=>{const a=window.__dragAudit,g=a.burstGroup;g.position({x:390,y:180});g.fire('dragmove',{evt:{}},true);a.releasePosition=g.position();g.fire('dragend',{evt:{}},true)})
      await page.waitForFunction(()=>window.__dragAudit.store.getState().routingStatus.phase==='ready')
      assert(await page.evaluate(()=>{const a=window.__dragAudit,n=a.store.getState().nodes[0];return n.x===a.releasePosition.x&&n.y===a.releasePosition.y}))
    })
    await check('Current-flow paths pause only moving connections and resume without recompiling every frame',async()=>{
      await page.evaluate(async()=>{
        const a=window.__dragAudit,{startCanvasRenderInstrumentation}=await import('/src/features/canvas/canvasRenderInstrumentation.ts'),{useSimulationStore}=await import('/src/store/simulationStore.ts')
        a.flowEvents=[];a.stopFlowTrace=startCanvasRenderInstrumentation(event=>{if(event.kind==='flow-compile')a.flowEvents.push(event)})
        a.simulation=useSimulationStore;useSimulationStore.setState({isSimulating:true,showCurrentFlow:true})
      })
      await page.waitForTimeout(100)
      const baseline=await page.evaluate(()=>window.__dragAudit.flowEvents.at(-1).compiledFlowPathCount)
      await page.evaluate(()=>window.__dragAudit.store.getState().beginNodeGesture('r-0'));await page.waitForTimeout(100)
      const moving=await page.evaluate(()=>window.__dragAudit.flowEvents.at(-1).compiledFlowPathCount)
      assert.equal(moving,baseline-1)
      const count=await page.evaluate(()=>window.__dragAudit.flowEvents.length)
      for(let i=0;i<3;i++){await page.evaluate(i=>window.__dragAudit.store.getState().queueNodeGesture('r-0',{x:400+i*10}),i);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
      assert.equal(await page.evaluate(()=>window.__dragAudit.flowEvents.length),count)
      await page.evaluate(()=>window.__dragAudit.store.getState().endNodeGesture('r-0',{x:420}));await page.waitForFunction(()=>window.__dragAudit.store.getState().routingStatus.phase==='ready');await page.waitForTimeout(100)
      assert.equal(await page.evaluate(()=>window.__dragAudit.flowEvents.at(-1).compiledFlowPathCount),baseline)
      await page.evaluate(()=>{const a=window.__dragAudit;a.stopFlowTrace();a.simulation.setState({isSimulating:false})})
    })
    await check('Read-only changes cancel pending movement before it can modify the document',async()=>{
      await page.evaluate(()=>{const a=window.__dragAudit; a.beforeReadonly=a.store.getState().nodes[0].x;a.store.getState().beginNodeGesture('r-0');a.store.getState().queueNodeGesture('r-0',{x:999});a.setReadOnly(true)})
      await page.waitForTimeout(100)
      assert(await page.evaluate(()=>{const a=window.__dragAudit;return a.store.getState().nodes[0].x===a.beforeReadonly&&a.store.getState().draggingNodeId===null}))
      await page.evaluate(()=>window.__dragAudit.setReadOnly(false))
    })
    await check('Unmount cancels pending gesture frames without a late document write',async()=>{
      await page.evaluate(()=>{const a=window.__dragAudit;a.beforeUnmount=a.store.getState().nodes[0].x;a.store.getState().beginNodeGesture('r-0');a.store.getState().queueNodeGesture('r-0',{x:1111});a.setMounted(false)})
      await page.waitForTimeout(200)
      assert(await page.evaluate(()=>{const a=window.__dragAudit;return a.store.getState().nodes[0].x===a.beforeUnmount&&a.store.getState().draggingNodeId===null}))
      await page.evaluate(()=>window.__dragAudit.setMounted(true));await page.waitForTimeout(150)
    })
  }
  await page.screenshot({path:path.join(output,`${reportName}.png`)})
} finally {
  fs.writeFileSync(path.join(output,`${reportName}.json`),JSON.stringify({task:'VFOPT-UI-017',phase,ui014Baseline,capturedAt:new Date().toISOString(),status:checks.some(c=>!c.passed)||errors.length?'failed':'passed',fixtureSha256:sha(path.join(root,'scripts/fixtures/drag-entry.tsx')),browser:browser?.version(),samples,checks,errors,limitations:['Mouse event to Konva layer draw completion is a browser paint proxy; physical display scanout is not measured.','100 built-in resistor nodes and 99 wires; isolated canvas without backend.']},null,2)+'\n')
  await browser?.close();await server.close()
}
assert(checks.every(c=>c.passed)&&errors.length===0)
