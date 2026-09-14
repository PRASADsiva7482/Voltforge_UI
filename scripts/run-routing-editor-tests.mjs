import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3106', checks = [], saves = [], errors = []
const fixture = { id: 'routing-owned', name: 'Routing editor fixture', boardType: 'ARDUINO_UNO', isPublic: false,
  owner: { id: 'routing-owner', keycloakId: 'routing-owner', displayName: 'Routing fixture' },
  canvasLayout: { nodes: [{ id: 'a', componentId: 'catalog_resistor', type: 'RESISTOR', name: 'A', x: 60, y: 100, width: 80, height: 30, rotation: 0, pins: [], properties: { resistance: 470 } }, { id: 'b', componentId: 'catalog_resistor', type: 'RESISTOR', name: 'B', x: 400, y: 180, width: 80, height: 30, rotation: 0, pins: [], properties: { resistance: 1000 } }], wires: [{ id: 'link', fromNodeId: 'a', fromPinId: 'pin2', toNodeId: 'b', toPinId: 'pin1', routingMode: 'auto', bendPoints: [], color: '#22c55e' }], viewport: { x: 0, y: 0, scale: 1 } },
  componentConfig: {}, codeFiles: [{ id: 'code', filename: 'main.ino', content: 'void setup() {}\nvoid loop() { delay(100); }', language: 'cpp', sortOrder: 0 }], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', forkCount: 0, viewCount: 0 }
let saved = structuredClone(fixture), revision = 0, browser
const server = await createServer({ root, server: { host: 'localhost', port: 3106, strictPort: true }, plugins: [{ name: 'routing-editor-fixture', configureServer(vite) {
  vite.middlewares.use(async (request, response, next) => {
    if (!request.headers.accept?.includes('text/html')) return next()
    response.setHeader('Content-Type', 'text/html')
    response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html><body><div id="root"></div><script type="module" src="/scripts/fixtures/routing-editor-entry.tsx"></script></body></html>'))
  })
} }] })
const check = async (name, action) => { try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (error) { checks.push({ name, passed: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message) } }
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.addInitScript(() => {
    const a = window.__routingEditor = { delay: 500, workers: 0, terminations: 0, sockets: [], sends: [] }
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url, options) { super(url, options); this.routing = String(url).includes('CanvasRoutingWorker'); if (this.routing) a.workers++ }
      postMessage(message, options) { if (this.routing && a.delay) this.timer = setTimeout(() => super.postMessage(message, options), a.delay); else super.postMessage(message, options) }
      terminate() { clearTimeout(this.timer); if (this.routing) a.terminations++; super.terminate() }
    }
    class Socket {
      static OPEN = 1; static CONNECTING = 0; static CLOSED = 3; readyState = 0
      constructor() { a.sockets.push(this); setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; this.onopen?.({}) }, 0) }
      send(frame) {
        if (frame.startsWith('CONNECT\n')) setTimeout(() => this.onmessage?.({ data: 'CONNECTED\nversion:1.2\n\n\0' }), 0)
        if (frame.startsWith('SEND\n') && frame.includes('/canvas.update')) a.sends.push(JSON.parse(frame.slice(frame.indexOf('\n\n') + 2, -1)))
      }
      close() { this.readyState = 3; this.onclose?.({}) }
    }
    window.WebSocket = Socket
    a.remote = payload => a.sockets.findLast(socket => socket.readyState === 1)?.onmessage?.({ data: 'MESSAGE\n\n' + JSON.stringify({ userId: 'peer', eventType: 'CANVAS_SYNC', payload }) + '\0' })
  })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname.includes('/api/v1/')) {
      const api = url.pathname.split('/api/v1')[1]
      if (api === '/projects/routing-owned') {
        if (request.method() === 'PUT') {
          const payload = request.postDataJSON(); saves.push(payload)
          saved = { ...saved, ...payload, codeFiles: payload.codeFiles.map(file => ({ ...saved.codeFiles.find(old => old.filename === file.filename), ...file })), updatedAt: `2026-01-01T00:00:${String(++revision).padStart(2, '0')}Z` }
        }
        return route.fulfill({ json: { success: true, data: saved } })
      }
      return route.fulfill({ status: api.startsWith('/ai/') ? 503 : 200, json: { success: !api.startsWith('/ai/'), data: [] } })
    }
    return url.origin === origin || url.hostname === 'cdn.jsdelivr.net' ? route.continue() : route.abort()
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000)
  await page.goto(origin + '/editor/routing-owned', { waitUntil: 'domcontentloaded' })
  const ready = () => page.waitForFunction(() => window.__routingEditor.store.getState().routingStatus.phase === 'ready')
  await ready()
  await check('Real editor saves versioned route metadata and reuses it after reload', async () => {
    const savedResponse = page.waitForResponse(response => response.request().method() === 'PUT')
    await page.keyboard.press('Control+s'); await savedResponse
    assert.equal(saves.at(-1).canvasLayout.routeCache.version, 'vf-grid-route-1')
    await page.reload(); await ready()
    assert.equal(await page.evaluate(() => window.__routingEditor.workers), 0)
    assert.equal(await page.evaluate(() => window.__routingEditor.store.getState().routingStatus.reused), 1)
  })
  await check('Public share includes the cache and opens without rerouting', async () => {
    await page.getByRole('button', { name: /^Show secondary editor tools/ }).click()
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.goto(link); await ready()
    assert.equal(await page.evaluate(() => window.__routingEditor.workers), 0)
    assert.equal(await page.evaluate(() => window.__routingEditor.store.getState().routingStatus.reused), 1)
  })
  await check('Remote cache reuse and recomputation cause no dirty state, echo or autosave', async () => {
    await page.goto(origin + '/editor/routing-owned'); await ready()
    await page.waitForFunction(() => window.__routingEditor.sockets.some(socket => socket.readyState === 1))
    const beforeSaves = saves.length
    await page.evaluate(() => { const a = window.__routingEditor, s = a.store.getState(); a.remote({ nodes: s.documentNodes, wires: s.wires, viewport: s.viewport, routeCache: s.routeCache }) })
    assert.equal(await page.evaluate(() => window.__routingEditor.workers), 0)
    await page.evaluate(() => { const a = window.__routingEditor, s = a.store.getState(); const nodes = structuredClone(s.documentNodes); nodes[0].x = 133; a.remote({ nodes, wires: s.wires, viewport: s.viewport, routeCache: s.routeCache }) })
    await ready(); await page.waitForTimeout(10500)
    assert.equal(await page.evaluate(() => window.__routingEditor.project.getState().isDirty), false)
    assert.equal(await page.evaluate(() => window.__routingEditor.sends.length), 0); assert.equal(saves.length, beforeSaves)
  })
  await check('Local edits during remote routing survive and publish cache on a later real edit', async () => {
    await page.evaluate(() => { const a = window.__routingEditor, s = a.store.getState(); a.delay = 900; const nodes = structuredClone(s.documentNodes); nodes[0].x = 144; a.remote({ nodes, wires: s.wires, viewport: s.viewport }); a.store.getState().commitNodeUpdate('a', { x: 177 }) })
    await ready()
    assert.equal(await page.evaluate(() => window.__routingEditor.store.getState().nodes[0].x), 177)
    assert.equal(await page.evaluate(() => window.__routingEditor.project.getState().isDirty), true)
    await page.evaluate(() => window.__routingEditor.store.getState().setViewport({ x: 21, y: 11, scale: 1 }))
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => window.__routingEditor.sends.at(-1).payload.routeCache.version), 'vf-grid-route-1')
    const savedResponse = page.waitForResponse(response => response.request().method() === 'PUT')
    await page.keyboard.press('Control+s'); await savedResponse
  })
  await check('Editor navigation terminates pending routing with no late store publication', async () => {
    await page.evaluate(() => { const a = window.__routingEditor, s = a.store.getState(); a.delay = 900; const nodes = structuredClone(s.documentNodes); nodes[0].x = 188; a.remote({ nodes, wires: s.wires, viewport: s.viewport }); a.navigate('/outside') })
    await page.getByRole('heading', { name: 'Outside routing fixture' }).waitFor()
    const initial = await page.evaluate(() => { const a = window.__routingEditor; a.afterUnmount = a.store.getState().wires; return a.terminations })
    await page.waitForTimeout(1100)
    assert(initial > 0)
    assert.equal(await page.evaluate(() => { const a = window.__routingEditor; return a.afterUnmount === a.store.getState().wires }), true)
  })
  await check('Lab exit restores authored canvas and its valid cache without runtime feedback', async () => {
    await page.goto(origin + '/editor/routing-owned'); await ready()
    await page.evaluate(() => { const a = window.__routingEditor; a.beforeLab = a.store.getState().documentNodes; a.store.getState().updateRuntimeNode('a', { properties: { testFeedback: 42 } }); a.navigate('/labs/lab-voltage-divider') })
    await page.waitForFunction(() => !window.__routingEditor.store.getState().nodes.some(node => node.id === 'a'))
    await page.evaluate(() => window.__routingEditor.navigate('/outside'))
    await page.getByRole('heading', { name: 'Outside routing fixture' }).waitFor()
    assert.equal(await page.evaluate(() => window.__routingEditor.store.getState().nodes.find(node => node.id === 'a')?.properties.testFeedback), undefined)
    assert.equal(await page.evaluate(() => window.__routingEditor.store.getState().routeCache?.version), 'vf-grid-route-1')
    assert.equal(await page.evaluate(() => window.__routingEditor.workers), 0)
  })
} finally {
  fs.writeFileSync(path.join(root, 'docs/reports/vfopt-ui-016-routing-editor-tests.json'), JSON.stringify({ task: 'VFOPT-UI-016', capturedAt: new Date().toISOString(), status: checks.some(check => !check.passed) || errors.length ? 'failed' : 'passed', fixtureSha256: crypto.createHash('sha256').update(JSON.stringify(fixture)).digest('hex'), checks, errors, saveRequests: saves.length, conditions: 'Actual editor/Monaco/labs and worker; HTTP/STOMP fixtures; worker dispatch delayed only by the harness to verify lifecycle races; no real backend writes.' }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
assert(checks.every(check => check.passed) && errors.length === 0, 'Routing editor checks failed')
