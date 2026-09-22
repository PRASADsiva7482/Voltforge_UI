import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const phase = process.argv.includes('--before') ? 'before' : 'after'
const origin = 'http://localhost:3103', output = path.join(root, 'docs/reports')
const fixture = {
  id: 'dirty-owned', name: 'Document dirty fixture', boardType: 'ARDUINO_UNO', isPublic: false,
  owner: { id: 'render-owner', keycloakId: 'render-owner', displayName: 'Render fixture' },
  canvasLayout: { nodes: Array.from({ length: 25 }, (_, index) => ({ id: `led-${index}`, componentId: 'led-standard', type: 'LED_STANDARD', name: `LED ${index}`, x: 60 + index % 5 * 85, y: 60 + Math.floor(index / 5) * 75, width: 40, height: 50, rotation: 0, properties: { isLit: false, ledColor: 'red' }, pins: [] })), wires: [], viewport: { x: 0, y: 0, scale: 1 } },
  componentConfig: {}, codeFiles: [{ id: 'dirty-code', filename: 'main.ino', content: 'void setup() {}\nvoid loop() { delay(100); }', language: 'cpp', sortOrder: 0 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', forkCount: 0, viewCount: 0,
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
let savedProject = structuredClone(fixture), revision = 0, delaySave = 0, failSave = false, browser
const saves = [], checks = [], windows = [], errors = []
const server = await createServer({ root, server: { host: 'localhost', port: 3103, strictPort: true }, plugins: [{
  name: 'document-browser-fixture',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes('text/html') || !/^\/(editor|outside)(\/|\?|$)/.test(request.url)) return next()
      response.setHeader('Content-Type', 'text/html')
      response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html><body><div id="root"></div><script type="module" src="/scripts/fixtures/editor-render-entry.tsx"></script></body></html>'))
    })
  },
}] })
async function check(name, action) {
  try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
  catch (error) { checks.push({ name, passed: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message) }
}
try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read','clipboard-write'] })
  await context.addInitScript(() => {
    const audit = window.__editorAudit = { commits: {}, counting: false, serializations: {}, sends: [], sockets: [] }
    const stringify = JSON.stringify
    JSON.stringify = function(value, ...args) {
      if (audit.counting && value && typeof value === 'object') {
        const kind = value.boardWidth_mm !== undefined ? 'pcb' : value.nodes && value.wires ? 'canvas' : value.canvasLayout ? 'save' : value.payload?.nodes ? 'collaboration' : null
        if (kind) audit.serializations[kind] = (audit.serializations[kind] || 0) + 1
      }
      return Reflect.apply(stringify, JSON, [value, ...args])
    }
    class FixtureSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
      readyState = 0
      constructor() { audit.sockets.push(this); setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; this.onopen?.({}) }, 0) }
      send(frame) {
        if (frame.startsWith('CONNECT\n')) setTimeout(() => this.onmessage?.({ data: 'CONNECTED\nversion:1.2\n\n\0' }), 0)
        if (frame.startsWith('SEND\n') && frame.includes('/canvas.update')) audit.sends.push(JSON.parse(frame.slice(frame.indexOf('\n\n') + 2, -1)))
      }
      close() { this.readyState = 3; this.onclose?.({}) }
    }
    window.WebSocket = FixtureSocket
    audit.remote = payload => audit.sockets.findLast(socket => socket.readyState === 1)?.onmessage?.({ data: 'MESSAGE\n\n' + stringify({ userId: 'peer-owner', eventType: 'CANVAS_SYNC', payload }) + '\0' })
  })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname.includes('/api/v1/')) {
      const api = url.pathname.slice(url.pathname.indexOf('/api/v1/') + 7)
      if (api === '/projects/dirty-owned') {
        if (request.method() === 'PUT') {
          const payload = request.postDataJSON()
          saves.push(structuredClone(payload))
          if (delaySave) await new Promise(resolve => setTimeout(resolve, delaySave))
          if (failSave) return route.fulfill({ status: 409, json: { success: false, errorCode: 'PROJECT_REVISION_STALE' } })
          savedProject = { ...savedProject, ...payload, codeFiles: payload.codeFiles.map(file => ({ ...savedProject.codeFiles.find(existing => existing.filename === file.filename), ...file })), updatedAt: `2026-01-01T00:00:${String(++revision).padStart(2,'0')}Z` }
        }
        return route.fulfill({ json: { success: true, data: savedProject } })
      }
      if (/compile/.test(api)) return route.fulfill({ json: { success: true, data: { success: false, compiler: 'fixture', stderr: 'No compiler in this document fixture' } } })
      if (api.startsWith('/ai/')) return route.fulfill({ status: 503, json: { success: false } })
      return route.fulfill({ json: { success: true, data: [] } })
    }
    if (url.origin === origin || url.hostname === 'cdn.jsdelivr.net') return route.continue()
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/editor/dirty-owned')
  await page.getByRole('heading', { name: fixture.name, exact: true }).waitFor()
  await page.waitForFunction(() => window.__editorAudit.stores.canvas.getState().nodes.length === 25)
  await page.locator('.monaco-editor textarea').first().waitFor({ state: 'attached', timeout: 45000 })
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click()
  await page.waitForTimeout(1500)
  if (phase === 'before') await page.evaluate(() => window.__editorAudit.stores.project.getState().setDirty(false))
  else await check('Starting simulation does not dirty a clean document', async () => {
    assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty),false)
  })
  const saveStart = saves.length
  const initial = await page.evaluate(() => {
    const a = window.__editorAudit
    a.counting = true; a.serializations = {}; a.sends = []; a.runtimeUpdates = 0; a.dirtyTransitions = 0
    a.unsubscribe = a.stores.project.subscribe((next, previous) => { if (next.isDirty && !previous.isDirty) a.dirtyTransitions++ })
    a.timer = setInterval(() => {
      const state = a.stores.canvas.getState()
      state.updateRuntimeNode('led-0', { properties: { isLit: a.runtimeUpdates % 2 === 0, brightness: a.runtimeUpdates % 100 } })
      a.stores.pcb.getState().selectFootprint(null)
      a.runtimeUpdates++
    }, 50)
    return { began: performance.now(), modelRevision: a.stores.canvas.getState().modelRevision, documentRevision: a.stores.canvas.getState().localDocumentRevision ?? null }
  })
  // Three waits keep orchestration responsive while measuring a real 60-second window.
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(20000); console.log(`Runtime window: ${(i + 1) * 20} seconds`) }
  const result = await page.evaluate(initial => {
    const a = window.__editorAudit
    clearInterval(a.timer); a.unsubscribe(); a.counting = false
    return { elapsedMs: performance.now() - initial.began, runtimeUpdates: a.runtimeUpdates, serializations: a.serializations, canvasSends: a.sends.length, dirtyTransitions: a.dirtyTransitions, dirty: a.stores.project.getState().isDirty, modelRevisionDelta: a.stores.canvas.getState().modelRevision - initial.modelRevision, documentRevisionDelta: a.stores.canvas.getState().localDocumentRevision === undefined ? null : a.stores.canvas.getState().localDocumentRevision - initial.documentRevision, simulationTime: a.stores.simulation.getState().simulationTime }
  }, initial)
  result.saveRequests = saves.length - saveStart; windows.push(result)
  console.log(JSON.stringify(result))
  if (phase === 'after') await check('60-second running editor has zero runtime dirty/save/broadcast/serialization work', () => {
    assert(result.elapsedMs >= 60000); assert(result.runtimeUpdates >= 1000); assert(result.simulationTime > 0)
    assert.equal(result.saveRequests, 0); assert.equal(result.canvasSends, 0); assert.equal(result.dirtyTransitions, 0)
    assert.equal(result.documentRevisionDelta, 0); assert.equal(result.modelRevisionDelta, 0); assert.deepEqual(result.serializations, {})
  })
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).click()
  if (phase === 'after') await check('Stopping simulation keeps the document clean', async () => {
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty), false)
  })
  await page.screenshot({ path: path.join(output, `vfopt-ui-011-dirty-${phase}.png`) })
  if (phase === 'after') {
    await check('Mounted PCB ignores runtime feedback without document serialization or dirty work', async () => {
      await page.getByTitle('2-Layer PCB Layout view',{exact:true}).click()
      await page.locator('.vf-pcb-canvas').waitFor(); await page.waitForTimeout(500)
      const result=await page.evaluate(async () => {
        const a=window.__editorAudit; a.counting=true;a.serializations={}
        const previous=a.stores.pcb.getState().localDocumentRevision
        for(let i=0;i<100;i++) {
          a.stores.canvas.getState().updateRuntimeNode('led-0',{properties:{isLit:i%2===0}})
          a.stores.pcb.getState().selectFootprint(null)
          await new Promise(resolve=>requestAnimationFrame(resolve))
        }
        a.counting=false
        return { serializations:a.serializations,dirty:a.stores.project.getState().isDirty,revisionDelta:a.stores.pcb.getState().localDocumentRevision-previous }
      })
      assert.deepEqual(result.serializations,{});assert.equal(result.dirty,false);assert.equal(result.revisionDelta,0)
      windows.push({ name:'Mounted PCB', runtimeUpdates:100, ...result })
    })
    const storeEdit = async (x, code) => page.evaluate(({x,code}) => {
      const { canvas, project, pcb } = window.__editorAudit.stores
      canvas.getState().commitNodeUpdate('led-0', { x })
      project.getState().updateCodeFileContent('dirty-code', code)
      pcb.getState().setBoardDimensions(x, 90)
      return project.getState().isDirty
    }, {x,code})
    const save = async () => {
      await page.getByRole('button', { name: 'Save project', exact: true }).click()
      await page.waitForFunction(() => !window.__editorAudit.stores.project.getState().isSaving)
      await page.waitForTimeout(250)
    }
    await check('Real edits become dirty synchronously and save authored code, canvas and PCB', async () => {
      assert.equal(await storeEdit(173, '// document revision edit'), true)
      await page.evaluate(() => window.__editorAudit.stores.canvas.getState().updateRuntimeNode('led-0', { properties: { isLit:true,runtimeOnlyKey:'do not save' } }))
      const before = saves.length
      await save()
      assert.equal(saves.length,before+1)
      const payload = saves.at(-1)
      assert.equal(payload.canvasLayout.nodes[0].x,173)
      assert.equal(payload.canvasLayout.nodes[0].properties.isLit,false)
      assert.equal(payload.canvasLayout.nodes[0].properties.runtimeOnlyKey,undefined)
      assert.equal(payload.codeFiles[0].content,'// document revision edit')
      assert.equal(payload.componentConfig.pcbLayout.boardWidth_mm,173)
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty),false)
    })
    await check('Saved real edits survive browser reload', async () => {
      await page.reload()
      await page.waitForFunction(() => window.__editorAudit.stores.canvas.getState().nodes[0]?.x === 173)
      const state = await page.evaluate(() => ({ code:window.__editorAudit.stores.project.getState().activeCodeFile.content,pcb:window.__editorAudit.stores.pcb.getState().boardWidth_mm,dirty:window.__editorAudit.stores.project.getState().isDirty }))
      assert.equal(state.code,'// document revision edit'); assert.equal(state.pcb,173); assert.equal(state.dirty,false)
    })
    await check('A delayed save cannot acknowledge or reload a newer edit', async () => {
      await storeEdit(180, '// first save')
      delaySave=1200
      const before=saves.length
      await page.getByRole('button',{name:'Save project',exact:true}).click()
      await page.waitForFunction(() => window.__editorAudit.stores.project.getState().isSaving)
      await storeEdit(190, '// edit while saving')
      await page.keyboard.press('Control+s')
      await page.waitForFunction(() => !window.__editorAudit.stores.project.getState().isSaving)
      delaySave=0
      assert.equal(saves.length,before+1,'Only one request may be in flight')
      const state=await page.evaluate(() => ({ x:window.__editorAudit.stores.canvas.getState().documentNodes[0].x,code:window.__editorAudit.stores.project.getState().activeCodeFile.content,dirty:window.__editorAudit.stores.project.getState().isDirty }))
      assert.equal(state.x,190); assert.equal(state.code,'// edit while saving'); assert.equal(state.dirty,true)
      const expectedRevision=savedProject.updatedAt
      await save()
      assert.equal(saves.at(-1).canvasLayout.nodes[0].x,190)
      assert.equal(saves.at(-1).codeFiles[0].content,'// edit while saving')
      assert.equal(saves.at(-1).expectedRevision,expectedRevision)
    })
    await check('A stale background GET cannot replace a newly saved document', async () => {
      await page.evaluate(stale => window.__editorAudit.queryClient.setQueryData(['project','dirty-owned'],stale),fixture)
      await page.waitForTimeout(300)
      assert.equal(await page.evaluate(()=>window.__editorAudit.stores.canvas.getState().documentNodes[0].x),190)
      assert.equal(await page.evaluate(()=>window.__editorAudit.stores.project.getState().activeCodeFile.content),'// edit while saving')
    })
    await check('Failed saves retain dirty edits and permit retry', async () => {
      await storeEdit(200,'// retry me'); failSave=true
      await save()
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty),true)
      failSave=false; await save()
      assert.equal(saves.at(-1).codeFiles[0].content,'// retry me')
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty),false)
    })
    await check('Clean remote application creates no dirty event, save or echo', async () => {
      await page.waitForTimeout(300)
      const before=saves.length
      await page.evaluate(() => {
        const a=window.__editorAudit,canvas=a.stores.canvas.getState()
        a.sends=[]
        a.remote({ nodes:canvas.documentNodes.map(node=>node.id==='led-0'?{...node,x:211}:node),wires:canvas.wires,viewport:canvas.viewport,pcbLayout:a.stores.pcb.getState().getLayout() })
      })
      await page.waitForTimeout(11000)
      const state=await page.evaluate(() => ({x:window.__editorAudit.stores.canvas.getState().documentNodes[0].x,dirty:window.__editorAudit.stores.project.getState().isDirty,sends:window.__editorAudit.sends.length}))
      assert.equal(state.x,211);assert.equal(state.dirty,false);assert.equal(state.sends,0);assert.equal(saves.length,before)
    })
    await check('Local edit immediately after remote application is dirty and publishes once', async () => {
      await page.evaluate(() => {
        const a=window.__editorAudit,canvas=a.stores.canvas.getState()
        a.sends=[]
        a.remote({ nodes:canvas.documentNodes,wires:canvas.wires,viewport:canvas.viewport })
        canvas.commitNodeUpdate('led-0',{x:222})
        a.stores.canvas.getState().updateRuntimeNode('led-0',{properties:{isLit:true}})
      })
      await page.waitForTimeout(400)
      const state=await page.evaluate(() => ({dirty:window.__editorAudit.stores.project.getState().isDirty,sends:window.__editorAudit.sends}))
      assert.equal(state.dirty,true);assert.equal(state.sends.length,1)
      assert.equal(state.sends[0].payload.nodes[0].x,222);assert.equal(state.sends[0].payload.nodes[0].properties.isLit,false)
      await save()
    })
    await check('Incoming remote data cannot overwrite pending local edits', async () => {
      await storeEdit(230,'// local pending')
      await page.evaluate(() => {
        const a=window.__editorAudit,canvas=a.stores.canvas.getState()
        a.remote({nodes:canvas.documentNodes.map(node=>({...node,x:999})),wires:canvas.wires})
      })
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.canvas.getState().documentNodes[0].x),230)
      await save()
    })
    await check('Autosave saves the latest real edit after ten seconds', async () => {
      const before=saves.length
      await storeEdit(240,'// autosaved')
      await page.waitForTimeout(10800)
      assert.equal(saves.length,before+1);assert.equal(saves.at(-1).codeFiles[0].content,'// autosaved')
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().isDirty),false)
    })
    await check('Permission revocation blocks queued collaboration and save shortcuts', async () => {
      await page.evaluate(() => {
        const a=window.__editorAudit;a.sends=[]
        a.stores.canvas.getState().commitNodeUpdate('led-0',{x:250})
        const project=a.stores.project
        project.setState({currentProject:{...project.getState().currentProject,owner:{keycloakId:'someone-else'}}})
      })
      await page.getByRole('button',{name:'Fork project to edit',exact:true}).waitFor()
      const before=saves.length
      await page.keyboard.press('Control+s');await page.waitForTimeout(400)
      assert.equal(saves.length,before);assert.equal(await page.evaluate(()=>window.__editorAudit.sends.length),0)
    })
    await check('Background permission changes preserve edits and the save conflict baseline', async () => {
      const previous=await page.evaluate(() => window.__editorAudit.stores.project.getState().currentProject.updatedAt)
      const remote={...savedProject,owner:{keycloakId:'remote-owner'},updatedAt:'2026-01-02T00:00:00Z',codeFiles:[{...savedProject.codeFiles[0],content:'// remote replacement'}]}
      await page.evaluate(remote => window.__editorAudit.queryClient.setQueryData(['project','dirty-owned'],remote),remote)
      await page.waitForTimeout(300)
      const state=await page.evaluate(()=>({project:window.__editorAudit.stores.project.getState().currentProject,dirty:window.__editorAudit.stores.project.getState().isDirty,x:window.__editorAudit.stores.canvas.getState().documentNodes[0].x}))
      assert.equal(state.project.owner.keycloakId,'remote-owner');assert.equal(state.project.updatedAt,previous)
      assert.equal(state.project.codeFiles[0].content,'// autosaved');assert.equal(state.x,250);assert.equal(state.dirty,true)
    })
    await check('Navigating away cancels autosave and document listeners', async () => {
      await page.evaluate(() => {
        const p=window.__editorAudit.stores.project;p.setState({currentProject:{...p.getState().currentProject,owner:{keycloakId:'render-owner'}},isDirty:true})
      })
      await page.getByRole('button',{name:'Save project',exact:true}).waitFor()
      const before=saves.length
      await page.evaluate(() => {history.pushState({},'','/outside');window.dispatchEvent(new PopStateEvent('popstate'))})
      await page.getByRole('heading',{name:'Outside editor fixture'}).waitFor()
      await page.evaluate(() => {window.__editorAudit.stores.project.getState().setDirty(false);window.__editorAudit.stores.canvas.getState().commitNodeUpdate('led-0',{x:260})})
      await page.waitForTimeout(10500)
      assert.equal(saves.length,before);assert.equal(await page.evaluate(()=>window.__editorAudit.stores.project.getState().isDirty),false)
    })
  }
} catch (error) { checks.push({ name: 'Harness completed', passed: false, error: error.stack }); console.error(error.message) }
finally {
  const browserVersion = browser?.version()
  await browser?.close(); await server.close()
  const report = { task: 'VFOPT-UI-011', phase, capturedAt: new Date().toISOString(), browser: browserVersion, node: process.version, fixtureSha256: sha(JSON.stringify(fixture)), fixture: '25 LED nodes; real editor/Monaco/engine running interpreter loop, plus 20 Hz injected runtime feedback and irrelevant PCB selection. Isolated API and STOMP fixtures; no live writes.', windows, checks, errors, status: checks.every(check => check.passed) && !errors.length ? 'passed' : 'failed', limitations: ['Does not establish compiled firmware fidelity, remote-host performance or real-account collaboration.', 'Serialization counters instrument document-shaped JSON.stringify calls only in this browser fixture.'] }
  fs.writeFileSync(path.join(output, `vfopt-ui-011-dirty-${phase}.json`), JSON.stringify(report, null, 2) + '\n')
  if (report.status === 'failed') process.exitCode = 1
}
