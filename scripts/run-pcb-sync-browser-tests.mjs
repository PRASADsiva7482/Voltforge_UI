import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
const root=fileURLToPath(new URL('..',import.meta.url)),origin='http://localhost:3108',phase=process.argv.includes('--before')?'before':'after'
const output=path.join(root,'docs/reports'),checks=[],samples=[],errors=[]
let browser, failure
const server=await createServer({root,server:{host:'localhost',port:3108,strictPort:true},plugins:[{name:'pcb-sync-fixture',enforce:'pre',transform(source,id){
  if(!/\/(PcbCanvas\.tsx|pcbSchematicSync\.ts)$/.test(id.replaceAll('\\','/')))return
  return source.replace('const col = index % 5;', 'if (globalThis.__pcbSyncAudit) globalThis.__pcbSyncAudit.generated++; const col = index % 5;')
    .replace('const next = new Map<string, Map<string, string>>();', 'if (globalThis.__pcbSyncAudit) globalThis.__pcbSyncAudit.netIndexBuilds++; const next = new Map<string, Map<string, string>>();')
},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.headers.accept?.includes('text/html'))return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><head><title>PCB sync audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/pcb-sync-entry.tsx"></script></body></html>'))})}}]})
async function check(name,fn){try{await fn();checks.push({name,passed:true});console.log('PASS '+name)}catch(e){checks.push({name,passed:false,error:e.message});console.error('FAIL '+name+': '+e.message)}}
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1366,height:800}})
  await context.addInitScript(()=>{const a=window.__pcbSyncAudit={generated:0,ratlineComputations:0,footprintComparisons:0,netIndexBuilds:0};const stringify=JSON.stringify;JSON.stringify=function(value,...args){if(Array.isArray(value)&&value[0]?.componentId&&Array.isArray(value[0]?.pads))a.footprintComparisons++;return Reflect.apply(stringify,JSON,[value,...args])}})
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'networkidle'})
  await page.waitForFunction(()=>window.__pcbSyncAudit.pcb.getState().footprints.length===100)
  const sample=async(name,fn)=>{
    await page.evaluate(()=>{const a=window.__pcbSyncAudit;a.generated=0;a.ratlineComputations=0;a.footprintComparisons=0;a.netIndexBuilds=0;a.before=a.pcb.getState().footprints;a.started=performance.now()})
    await fn();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const result=await page.evaluate(name=>{const a=window.__pcbSyncAudit,s=a.pcb.getState();return{name,generated:a.generated,ratlineComputations:a.ratlineComputations,footprintComparisons:a.footprintComparisons,netIndexBuilds:a.netIndexBuilds,elapsedMs:performance.now()-a.started,footprintCount:s.footprints.length,preserved:s.footprints.filter(f=>a.before.includes(f)).length}},name)
    samples.push(result);console.log(JSON.stringify(result));return result
  }
  await sample('60 runtime updates',async()=>{for(let i=0;i<60;i++){await page.evaluate(i=>window.__pcbSyncAudit.canvas.getState().updateRuntimeNode('led-0',{properties:{isLit:i%2===0}}),i);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))}})
  await sample('60 schematic geometry updates',async()=>{for(let i=0;i<60;i++){await page.evaluate(i=>window.__pcbSyncAudit.canvas.getState().updateNode('led-0',{x:100+i}),i);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))}})
  await sample('Add one disconnected part',()=>page.evaluate(()=>{const a=window.__pcbSyncAudit,n=structuredClone(a.canvas.getState().documentNodes[0]);n.id='added-part';n.name='Added part';a.canvas.getState().addNode(n)}))
  await sample('Change one footprint package',()=>page.evaluate(()=>{const a=window.__pcbSyncAudit,n=a.canvas.getState().nodesById.get('led-0');a.canvas.getState().commitNodeUpdate(n.id,{properties:{...n.properties,footprint:'SMD'}})}))
  await sample('Move one PCB footprint',()=>page.evaluate(()=>window.__pcbSyncAudit.pcb.getState().updateFootprintPosition('fp_led-0',43,57,90)))
  if(phase==='after'){
    await check('Runtime and schematic geometry updates do no PCB generation, comparison or ratline work',async()=>{for(const s of samples.slice(0,2)){assert.equal(s.generated,0);assert.equal(s.footprintComparisons,0);assert.equal(s.ratlineComputations,0);assert.equal(s.netIndexBuilds,0);assert.equal(s.preserved,100)}})
    await check('Adding one disconnected part creates one footprint and preserves existing objects',async()=>{const s=samples[2];assert.equal(s.generated,1);assert.equal(s.preserved,100);assert.equal(s.footprintComparisons,0);assert.equal(s.ratlineComputations,0)})
    await check('Package edits and PCB movement preserve placement without whole-list regeneration',async()=>{assert(samples[3].generated<=1);assert.equal(samples[3].preserved,100);assert.equal(samples[3].ratlineComputations,0);assert.equal(samples[4].generated,0);assert.equal(samples[4].footprintComparisons,0);assert.equal(samples[4].ratlineComputations,1)})
    await check('A changed wire updates only incident footprints and one net index',async()=>{
      const result=await sample('Remove one wire',()=>page.evaluate(()=>window.__pcbSyncAudit.canvas.getState().removeWire('net-0')))
      assert.equal(result.generated,0);assert.equal(result.netIndexBuilds,1);assert.equal(result.ratlineComputations,1);assert.equal(result.preserved,99)
      const data=await page.evaluate(()=>{const a=window.__pcbSyncAudit,s=a.pcb.getState();return{s:s.footprints.slice(0,2).map(f=>({x:f.x,y:f.y,rotation:f.rotation,nets:f.pads.map(p=>p.netId)})),ratlines:s.ratlines.length}})
      assert.equal(data.s[0].x,43);assert.equal(data.s[0].y,57);assert.equal(data.s[0].rotation,90);assert.equal(data.ratlines,98)
      await page.evaluate(()=>window.__pcbSyncAudit.canvas.getState().undo())
    })
    await check('Delete and undo restore placed PCB identity, pads, traces and vias',async()=>{
      const data=await page.evaluate(async()=>{const a=window.__pcbSyncAudit,p=a.pcb.getState();p.addTrace({id:'keep',netId:'net-1',layer:'F.Cu',width_mm:.2,points:[{x:1,y:1},{x:2,y:2}]});p.addVia({id:'keep-via',x:5,y:5,drill_mm:.3,pad_mm:.6});a.saved=structuredClone(p.getLayout());const before=a.saved.footprints.find(f=>f.componentId==='led-0');a.canvas.getState().removeNode('led-0');await Promise.resolve();const removed=!a.pcb.getState().footprints.some(f=>f.componentId==='led-0');a.canvas.getState().undo();await Promise.resolve();return{before,after:a.pcb.getState().footprints.find(f=>f.componentId==='led-0'),removed,traces:a.pcb.getState().traces,vias:a.pcb.getState().vias}})
      assert(data.removed);assert.deepEqual(data.after,data.before);assert.equal(data.traces[0].id,'keep');assert.equal(data.vias[0].id,'keep-via')
    })
    await check('Immediate save layout and reload include latest package without changing placed pads or copper',async()=>{
      const data=await page.evaluate(async()=>{const a=window.__pcbSyncAudit,n=a.canvas.getState().nodesById.get('led-0');a.canvas.getState().commitNodeUpdate(n.id,{properties:{...n.properties,footprint:'custom-package'}});const saved=structuredClone(a.pcb.getState().getLayout());a.pcb.getState().loadPcb(saved);await Promise.resolve();return{saved,loaded:a.pcb.getState().getLayout()}})
      assert.deepEqual(data.loaded,data.saved);assert.equal(data.saved.footprints[0].packageType,'custom-package');assert.equal(data.saved.footprints[0].x,43)
    })
    await check('Scene remount reconciles edits while closed and retains previous PCB positions',async()=>{
      await page.evaluate(()=>window.__pcbSyncAudit.setMounted(false));await page.waitForFunction(()=>!document.querySelector('.vf-pcb-canvas'))
      await page.evaluate(()=>{const a=window.__pcbSyncAudit;a.canvas.getState().commitNodeUpdate('led-0',{name:'Changed while closed'});a.setMounted(true)})
      await page.waitForFunction(()=>window.__pcbSyncAudit.pcb.getState().footprints[0].name==='Changed while closed')
      const fp=await page.evaluate(()=>window.__pcbSyncAudit.pcb.getState().footprints[0]);assert.equal(fp.x,43);assert.equal(fp.rotation,90)
    })
    await check('Mouse drag commits PCB placement without moving the viewport or regenerating footprints',async()=>{
      const box=await page.locator('.konvajs-content').boundingBox(),before=await page.evaluate(()=>{const s=window.__pcbSyncAudit.pcb.getState();window.__pcbSyncAudit.generated=0;return{fp:s.footprints[1],viewport:s.viewport}})
      const x=box.x+40+before.fp.x*4,y=box.y+40+before.fp.y*4
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+24,y+16,{steps:6});await page.mouse.up()
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      const after=await page.evaluate(()=>{const a=window.__pcbSyncAudit,s=a.pcb.getState();return{fp:s.footprints[1],viewport:s.viewport,generated:a.generated}})
      assert.equal(after.fp.x,before.fp.x+6);assert.equal(after.fp.y,before.fp.y+4);assert.deepEqual(after.viewport,before.viewport);assert.equal(after.generated,0)
    })
    await check('Read-only scene disables routing controls and retains saved footprint identity',async()=>{
      await page.evaluate(()=>window.__pcbSyncAudit.setReadOnly(true));await page.waitForFunction(()=>document.querySelector('.vf-pcb-tool-btn--warning')?.disabled)
      assert(await page.getByRole('button',{name:'Via',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'10 mil',exact:true}).isDisabled())
      const result=await page.evaluate(()=>{const a=window.__pcbSyncAudit;return{count:a.pcb.getState().footprints.length,x:a.pcb.getState().footprints[0].x}});assert.equal(result.count,101);assert.equal(result.x,43)
    })
    await check('Empty and same-ID replacement documents clear stale ratlines and archived placements',async()=>{
      const result=await page.evaluate(async()=>{const a=window.__pcbSyncAudit;a.canvas.getState().loadCanvas([],[]);await Promise.resolve();const empty={footprints:a.pcb.getState().footprints.length,ratlines:a.pcb.getState().ratlines.length};a.pcb.getState().resetPcb();a.canvas.getState().loadCanvas(a.nodes,a.wires);await Promise.resolve();return{empty,x:a.pcb.getState().footprints[0].x,rotation:a.pcb.getState().footprints[0].rotation,ratlines:a.pcb.getState().ratlines.length}})
      assert.deepEqual(result.empty,{footprints:0,ratlines:0});assert.equal(result.x,20);assert.equal(result.rotation,0);assert.equal(result.ratlines,99)
    })
  }
  await page.screenshot({path:path.join(output,`vfopt-ui-025-pcb-sync-${phase}.png`)})
}catch(error){failure=error;errors.push(error.stack)}finally{fs.writeFileSync(path.join(output,`vfopt-ui-025-pcb-sync-${phase}.json`),JSON.stringify({task:'VFOPT-UI-025',phase,capturedAt:new Date().toISOString(),status:checks.some(c=>!c.passed)||errors.length?'failed':'passed',fixtureSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'scripts/fixtures/pcb-sync-entry.tsx'))).digest('hex'),browser:browser?.version(),samples,checks,errors,limitations:['100-component isolated PCB scene; HTTP is blocked. Counters instrument actual footprint generation, footprint-array stringify and ratline entrypoints.','Elapsed windows include browser scheduling/rendering and automation; no whole-laptop CPU or hardware pointer-to-paint claim.']},null,2)+'\n');await browser?.close();await server.close()}
if(failure)throw failure
assert(checks.every(c=>c.passed)&&errors.length===0)
