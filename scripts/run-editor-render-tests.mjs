import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import ts from 'typescript'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const phase = process.argv.includes('--before') ? 'before' : 'after'
const reportPrefix = process.argv.find(value => value.startsWith('--report-prefix='))?.split('=')[1] || 'vfopt-ui-010'
if (!/^[a-z0-9-]+$/.test(reportPrefix)) throw new Error('Invalid report prefix')
const origin = 'http://localhost:3102'
const output = path.join(root, 'docs/reports')
const functions = new Set(['CircuitEditorPage', 'ComponentPanel', 'CodeEditor', 'SolverDiagnosticsPanel', 'EditorSimulationTime', 'EditorAvrWorkload', 'EditorDocumentSync'])
const fixture = {
  id: 'render-owned', name: 'Editor render fixture', boardType: 'ARDUINO_UNO', isPublic: false,
  owner: { id: 'render-owner', keycloakId: 'render-owner', displayName: 'Render fixture' },
  canvasLayout: {
    nodes: Array.from({ length: 25 }, (_, index) => ({ id: `led-${index}`, componentId: 'led-standard', type: 'LED_STANDARD', name: `LED ${index}`, x: 60 + index % 5 * 85, y: 60 + Math.floor(index / 5) * 75, width: 40, height: 50, rotation: 0, properties: { isLit: false, ledColor: 'red' }, pins: [] })),
    wires: [], viewport: { x: 0, y: 0, scale: 1 },
  },
  componentConfig: {},
  codeFiles: [{ id: 'render-code', filename: 'main.ino', content: 'void setup() {}\nvoid loop() { delay(100); }', language: 'cpp', sortOrder: 0 }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', forkCount: 0, viewCount: 0,
}
const sourceFiles = ['src/features/editor/CircuitEditorPage.tsx', 'src/features/editor/ComponentPanel.tsx', 'src/features/editor/CodeEditor.tsx', 'src/features/editor/SolverDiagnosticsPanel.tsx', ...phase === 'after' ? ['src/features/editor/EditorDocumentSync.tsx','src/features/editor/EditorSimulationStatus.tsx','src/features/editor/editorDocumentSnapshots.ts'] : []]
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const measured = [], checks = [], errors = [], requests = []
const saves = []
let savedProject = structuredClone(fixture)
let browser
const server = await createServer({ root, server: { host: 'localhost', port: 3102, strictPort: true }, plugins: [{
  name: 'editor-audit-only', enforce: 'pre',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes('text/html') || !/^\/(editor|outside)(\/|\?|$)/.test(request.url)) return next()
      const html = await vite.transformIndexHtml(request.url, '<!doctype html><html><head><title>Editor render audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/editor-render-entry.tsx"></script></body></html>')
      response.setHeader('Content-Type', 'text/html'); response.end(html)
    })
  },
  transform(code, id) {
    if (!id.replaceAll('\\', '/').includes('/src/features/editor/') || !id.endsWith('.tsx')) return
    const tree = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const insertions = []
    for (const node of tree.statements) if (ts.isFunctionDeclaration(node) && node.name && functions.has(node.name.text) && node.body) {
      insertions.push({ position: node.body.getStart(tree) + 1, text: `\n__auditLayoutEffect(() => { const a = window.__editorAudit; if (a) a.commits['${node.name.text}'] = (a.commits['${node.name.text}'] || 0) + 1; });\n` })
    }
    if (id.endsWith('/CodeEditor.tsx')) {
      function inspect(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleEditorMount' && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
          insertions.push({ position: node.initializer.body.getStart(tree) + 1, text: '\nwindow.__editorAudit.monacoEditor = editor; window.__editorAudit.monaco = monaco;\n' })
        }
        ts.forEachChild(node, inspect)
      }
      inspect(tree)
    }
    if (!insertions.length) return
    for (const insertion of insertions.sort((a,b) => b.position-a.position)) code = code.slice(0,insertion.position) + insertion.text + code.slice(insertion.position)
    return { code: `import { useLayoutEffect as __auditLayoutEffect } from 'react';\n` + code, map: null }
  },
}] })

async function check(name, action) {
  try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
  catch (error) { checks.push({ name, passed: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message) }
}
const settle = page => page.waitForTimeout(250)
async function measure(page, name, kind, count = 60) {
  const result = await page.evaluate(async ({ kind, count }) => {
    const audit = window.__editorAudit, { canvas, simulation, project, pcb } = audit.stores
    audit.commits = {}
    const costs = [], frames = []
    for (let i=0;i<count;i++) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const began = performance.now()
      if (kind === 'runtime') canvas.getState().updateRuntimeNode('led-0', { properties: { isLit: i % 2 === 0 } })
      if (kind === 'clock') simulation.setState({ simulationTime: i / 60 })
      if (kind === 'avr') simulation.getState().setAvrWorkload({ active: true, averageSliceMs: i / 60 })
      if (kind === 'diagnostics') simulation.setState({ solverDiagnostics: { frameWallTimeMs: i } })
      if (kind === 'viewport') canvas.getState().setViewport({ x: i, y: i, scale: 1 })
      if (kind === 'code') project.getState().updateCodeFileContent('render-code', `// edit ${i}\nvoid setup() {}\nvoid loop() { delay(100); }`)
      if (kind === 'pcb') pcb.setState({ boardWidth_mm: 100 + i })
      costs.push(performance.now() - began)
      await new Promise(resolve => requestAnimationFrame(resolve))
      frames.push(performance.now() - began)
    }
    return { commits: { ...audit.commits }, operationMs: costs, updateToNextFrameMs: frames, dirty: project.getState().isDirty, modelRevision: canvas.getState().modelRevision }
  }, { kind, count })
  const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]
  measured.push({ name, kind, count, ...result, p50UpdateToNextFrameMs: percentile(result.updateToNextFrameMs,.5), p95UpdateToNextFrameMs: percentile(result.updateToNextFrameMs,.95) })
  console.log(name + ': ' + JSON.stringify(result.commits))
  return result
}

try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read','clipboard-write'] })
  await context.addInitScript(() => { window.__editorAudit = { commits: {} } })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname.includes('/api/v1/')) {
      const api = url.pathname.slice(url.pathname.indexOf('/api/v1/') + 7)
      requests.push({ path: api, method: request.method() })
      if (api === '/projects/render-owned') {
        if (request.method() === 'PUT') {
          const payload = request.postDataJSON()
          saves.push(structuredClone(payload))
          savedProject = { ...savedProject, ...payload, codeFiles: payload.codeFiles.map(file => ({ ...savedProject.codeFiles.find(existing => existing.filename === file.filename), ...file })), updatedAt: '2026-01-02T00:00:00Z' }
        }
        return route.fulfill({ json: { success: true, data: savedProject } })
      }
      if (/compile/.test(api)) return route.fulfill({ json: { success: true, data: { success: false, compiler: 'audit-unavailable', stderr: 'No real compiler in editor render fixture' } } })
      if (api.startsWith('/ai/')) return route.fulfill({ status: 503, json: { success: false } })
      return route.fulfill({ json: { success: true, data: [] } })
    }
    if (url.origin === origin || url.hostname === 'cdn.jsdelivr.net') return route.continue()
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(15000)
  await page.goto(origin + '/editor/render-owned', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: fixture.name, exact: true }).waitFor()
  await page.waitForFunction(() => window.__editorAudit.stores.canvas.getState().nodes.length === 25)
  await check('Real Monaco editor loads', async () => { await page.locator('.monaco-editor textarea').first().waitFor({ state: 'attached', timeout: 45000 }) })
  await settle(page)
  await measure(page,'First runtime feedback on a clean document','runtime',1)
  for (const kind of ['runtime','clock','avr','diagnostics','viewport','code','pcb']) {
    // Keep the before/after steady-state comparison independent of autosave and the first dirty transition.
    await page.evaluate(() => { window.__editorAudit.stores.project.getState().setDirty(false) })
    await settle(page)
    await page.evaluate(() => { window.__editorAudit.stores.project.getState().setDirty(true) })
    await settle(page)
    const r = await measure(page, `${kind}: 60 independent updates`, kind)
    if (phase === 'after') await check(`${kind}: editor shell and palette stay isolated`, () => {
      assert.equal(r.commits.CircuitEditorPage || 0, 0)
      assert.equal(r.commits.ComponentPanel || 0, 0)
      if (kind !== 'code') assert.equal(r.commits.CodeEditor || 0, 0)
    })
  }
  await page.screenshot({ path: path.join(output, `${reportPrefix}-${phase}.png`) })
  if (phase === 'after') {
    await check('Project metadata updates remain visible', async () => {
      await page.evaluate(() => {
        const store = window.__editorAudit.stores.project
        store.setState({ currentProject: { ...store.getState().currentProject, name: 'Renamed render fixture' } })
      })
      await page.getByRole('heading', { name: 'Renamed render fixture', exact: true }).waitFor()
    })
    await check('Real Monaco typing updates the active file without shell or palette commits', async () => {
      await page.evaluate(() => { window.__editorAudit.commits = {}; window.__editorAudit.keyFrames = []
        document.addEventListener('keydown', event => {
          if (event.key.length !== 1 || !event.target.closest('.monaco-editor')) return
          const began = performance.now()
          requestAnimationFrame(() => requestAnimationFrame(() => window.__editorAudit.keyFrames.push(performance.now() - began)))
        })
      })
      // Monaco 0.55 uses Chromium's EditContext; its IME textarea is not the
      // editor's keyboard target. Focus through the real editor API.
      await page.evaluate(() => window.__editorAudit.monacoEditor.focus())
      assert(await page.evaluate(() => window.__editorAudit.monacoEditor.hasTextFocus()))
      await page.keyboard.press('Control+End')
      await page.keyboard.type('\n// Monaco typing regression 0123456789', { delay: 35 })
      await settle(page)
      const result = await page.evaluate(() => ({ content: window.__editorAudit.stores.project.getState().activeCodeFile.content, commits: window.__editorAudit.commits, keyFrames: window.__editorAudit.keyFrames, diagnostic: { monacoText: window.__editorAudit.monacoEditor?.getValue(), focus: window.__editorAudit.monacoEditor?.hasTextFocus(), activeElement: document.activeElement?.className, readOnly: window.__editorAudit.monacoEditor?.getOption(window.__editorAudit.monaco.editor.EditorOption.readOnly) } }))
      assert(result.content.includes('Monaco typing regression 0123456789'), `Actual fixture text: ${JSON.stringify(result.content)}; diagnostic: ${JSON.stringify(result.diagnostic)}`)
      assert.equal(result.commits.CircuitEditorPage || 0, 0); assert.equal(result.commits.ComponentPanel || 0, 0)
      const ordered = [...result.keyFrames].sort((a,b)=>a-b)
      measured.push({ name:'Real Monaco typing', count:ordered.length, eventToSecondFrameMs:result.keyFrames, p50Ms:ordered[Math.ceil(ordered.length*.5)-1], p95Ms:ordered[Math.ceil(ordered.length*.95)-1], targetMs:50, commits:result.commits })
      assert(ordered[Math.ceil(ordered.length*.95)-1] <= 50, 'Typing event-to-frame p95 exceeds proposed 50 ms target')
    })
    await check('Share action captures the latest code, geometry, viewport and PCB', async () => {
      await page.getByRole('button', { name: /^Show secondary editor tools/ }).click()
      await page.evaluate(() => {
        const { canvas, pcb } = window.__editorAudit.stores
        canvas.getState().updateNode('led-0', { x: 173 })
        canvas.getState().setViewport({ x: 21, y: 34, scale: .9 })
        pcb.getState().setBoardDimensions(171, 92)
      })
      await page.getByRole('button', { name: 'Copy share link', exact: true }).click()
      const shared = await page.evaluate(async () => {
        const link = new URL(await navigator.clipboard.readText())
        const encoded = link.searchParams.get('state').replaceAll('-','+').replaceAll('_','/')
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), value => value.charCodeAt(0))))
      })
      assert.equal(shared.nodes.find(node=>node.id==='led-0').x,173)
      assert.equal(shared.viewport.x,21); assert.equal(shared.componentConfig.pcbLayout.boardWidth_mm,171)
      assert(shared.code.includes('Monaco typing regression')); assert.equal(shared.name,'Renamed render fixture')
    })
    await check('Save uses the latest document and code revision', async () => {
      const before = saves.length
      await page.getByRole('button', { name: 'Save project', exact: true }).click()
      await page.waitForFunction(() => !window.__editorAudit.stores.project.getState().isSaving)
      await settle(page)
      assert.equal(saves.length,before+1)
      const payload=saves.at(-1)
      assert.equal(payload.canvasLayout.nodes.find(node=>node.id==='led-0').x,173)
      assert.equal(payload.canvasLayout.viewport.x,21)
      assert.equal(payload.componentConfig.pcbLayout.boardWidth_mm,171)
      assert(payload.codeFiles[0].content.includes('Monaco typing regression'))
      assert.equal(payload.expectedRevision,'2026-01-01T00:00:00Z')
      await page.waitForFunction(() => window.__editorAudit.stores.project.getState().currentProject.updatedAt === '2026-01-02T00:00:00Z')
    })
    await check('Real canvas drag pans without shell or code-editor commits', async () => {
      if (await page.getByRole('button', { name: /^Hide secondary editor tools/ }).count()) await page.getByRole('button', { name: /^Hide secondary editor tools/ }).click()
      const area=await page.locator('.vf-editor__canvas-area').boundingBox()
      const previous=await page.evaluate(() => { window.__editorAudit.commits={}; return window.__editorAudit.stores.canvas.getState().viewport })
      await page.mouse.move(area.x+15,area.y+area.height-25)
      await page.mouse.down(); await page.mouse.move(area.x+95,area.y+area.height-50,{steps:12}); await page.mouse.up()
      await settle(page)
      const result=await page.evaluate(() => ({ viewport:window.__editorAudit.stores.canvas.getState().viewport,commits:window.__editorAudit.commits }))
      assert.notEqual(result.viewport.x,previous.x)
      assert.equal(result.commits.CircuitEditorPage||0,0); assert.equal(result.commits.CodeEditor||0,0); assert.equal(result.commits.ComponentPanel||0,0)
    })
    await check('Simulation start reads fresh source; pause, step, resume and stop reach the real engine', async () => {
      await page.evaluate(async () => {
        const { SimulationEngine } = await import('/src/features/simulator/SimulationEngine.ts')
        window.__editorAudit.engineCalls={}
        for (const name of ['start','pause','step','resume','stop']) {
          const original=SimulationEngine.prototype[name]
          SimulationEngine.prototype[name]=function(...args) {
            const calls=window.__editorAudit.engineCalls; calls[name]=(calls[name]||0)+1
            if(name==='start') window.__editorAudit.startedSource=args[0]
            return Reflect.apply(original,this,args)
          }
        }
        window.__editorAudit.stores.simulation.getState().clearSolverDiagnostics()
      })
      await page.getByRole('button',{name:'Start simulation',exact:true}).click()
      await page.waitForFunction(() => window.__editorAudit.engineCalls.start > 0)
      await page.waitForTimeout(700)
      assert((await page.evaluate(() => window.__editorAudit.startedSource)).includes('Monaco typing regression'))
      await page.getByTitle('Pause simulation',{exact:true}).click()
      await page.waitForTimeout(300)
      await page.getByTitle('Advance one simulation step',{exact:true}).click()
      await page.getByTitle('Resume simulation',{exact:true}).click()
      await page.getByTitle('Pause simulation',{exact:true}).click()
      await page.waitForTimeout(300)
      const clock=await measure(page,'Mounted live clock while engine paused','clock',30)
      assert(clock.commits.EditorSimulationTime>0); assert.equal(clock.commits.CircuitEditorPage||0,0)
      await page.getByRole('button',{name:'Stop simulation',exact:true}).click()
      const calls=await page.evaluate(() => window.__editorAudit.engineCalls)
      for(const name of ['start','pause','step','resume','stop']) assert(calls[name]>0,`${name} was not called`)
      assert.equal(await page.locator('.vf-editor__simulation-time').count(),0)
    })
    await check('Autosave remains scheduled during continuous edits and saves the latest snapshot', async () => {
      await page.evaluate(() => window.__editorAudit.stores.project.getState().setDirty(false))
      await settle(page)
      const before = saves.length
      await page.evaluate(async () => {
        const project = window.__editorAudit.stores.project
        const original = project.getState().activeCodeFile.content
        project.getState().setDirty(true)
        // Keep editing throughout the interval: unrelated renders must not
        // postpone the existing ten-second autosave indefinitely.
        for (let i = 0; i < 18; i++) {
          project.getState().updateCodeFileContent('render-code', original + `\n// autosave edit ${i}`)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      })
      await page.waitForTimeout(1800)
      assert.equal(saves.length, before + 1)
      assert(saves.at(-1).codeFiles[0].content.includes('autosave edit 17'))
      await page.waitForFunction(() => !window.__editorAudit.stores.project.getState().isSaving)
    })
    await check('Owner changes revoke editing and save shortcuts without stale closures', async () => {
      await page.evaluate(() => {
        const store=window.__editorAudit.stores.project
        store.setState({currentProject:{...store.getState().currentProject,owner:{keycloakId:'another-owner'}}})
      })
      await page.getByRole('button',{name:'Fork project to edit',exact:true}).waitFor()
      assert(await page.getByTitle('Undo (Ctrl+Z)',{exact:true}).isDisabled())
      const before=saves.length
      await page.keyboard.press('Control+s'); await settle(page)
      assert.equal(saves.length,before)
      const content=await page.evaluate(() => window.__editorAudit.stores.project.getState().activeCodeFile.content)
      await page.evaluate(() => window.__editorAudit.monacoEditor.focus())
      assert(await page.evaluate(() => window.__editorAudit.monacoEditor.getOption(window.__editorAudit.monaco.editor.EditorOption.readOnly)))
      await page.keyboard.type('blocked')
      assert.equal(await page.evaluate(() => window.__editorAudit.stores.project.getState().activeCodeFile.content),content)
      await page.evaluate(() => window.__editorAudit.setUser(null))
      await settle(page); await page.keyboard.press('Control+s'); await settle(page)
      assert.equal(saves.length,before)
    })
    await check('Unmount removes autosave and route-owned consumers', async () => {
      await page.evaluate(() => {
        window.__editorAudit.setUser({id:'render-owner',keycloakId:'render-owner',displayName:'Render fixture',username:'render-owner',role:'USER'})
        const store=window.__editorAudit.stores.project
        store.setState({currentProject:{...store.getState().currentProject,owner:{keycloakId:'render-owner'}},isDirty:true})
      })
      await page.getByRole('button',{name:'Save project',exact:true}).waitFor()
      const before=saves.length
      await page.evaluate(() => { history.pushState({},'', '/outside'); window.dispatchEvent(new PopStateEvent('popstate')) })
      await page.getByRole('heading',{name:'Outside editor fixture'}).waitFor()
      await page.evaluate(() => { window.__editorAudit.commits={}; window.__editorAudit.stores.canvas.getState().updateRuntimeNode('led-0',{properties:{isLit:true}}) })
      await page.waitForTimeout(10500)
      assert.equal(saves.length,before)
      assert.deepEqual(await page.evaluate(() => window.__editorAudit.commits),{})
    })
  }
} catch (error) {
  checks.push({ name: 'Harness completed', passed: false, error: error.stack })
  console.error(error)
} finally {
  await browser?.close()
  await server.close()
  fs.mkdirSync(output,{recursive:true})
  const report = { task:'VFOPT-UI-010',phase,capturedAt:new Date().toISOString(),fixtureSha256:sha(JSON.stringify(fixture)),sourceEvidence:sourceFiles.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),conditions:{browser:'Installed headless Chrome',viewport:'1366x768',mode:'Vite development with StrictMode; identical test-only layout-effect counters in actual editor components',auth:'Fixture AuthContext; no live identity validation',api:'Isolated intercepted HTTP fixtures; no real backend writes',monaco:'Actual configured CDN Monaco; readiness check recorded',timing:'Update to next animation frame is a scheduling proxy, not pixel paint or hardware input latency',scope:'25-node LED render fixture; no simulated solver work during subscription-isolation windows'},measured,checks,errors,requests,status:checks.every(c=>c.passed)&&!errors.length?'passed':'failed'}
  fs.writeFileSync(path.join(output,`${reportPrefix}-render-${phase}.json`),JSON.stringify(report,null,2)+'\n')
  if(report.status==='failed') process.exitCode=1
}
