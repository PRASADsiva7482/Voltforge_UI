import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { build, createServer, preview } from 'vite'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), origin = 'http://localhost:3113'
const phase = process.argv.includes('--before') ? 'before' : 'after', production = process.argv.includes('--production'), profile = process.argv.includes('--profile')
const mode = production ? 'production' : 'development', directory = path.join(root, 'node_modules/.cache/vfopt-ui-015'), reports = path.join(root, 'docs/reports')
fs.mkdirSync(reports, { recursive: true }); fs.mkdirSync(directory, { recursive: true })
const sources = ['src/features/canvas/CircuitCanvas.tsx', 'src/features/canvas/components/WireShape.tsx', 'src/features/canvas/components/ComponentNode.tsx', 'src/features/canvas/components/PinDot.tsx', 'src/utils/wireRouting.ts']
if (phase === 'before') for (const file of sources) {
  const target = path.join(directory, 'before', file)
  assert(fs.existsSync(target), `Missing original baseline snapshot: ${target}. Do not measure current code as the before baseline.`)
}
const hashes = Object.fromEntries(sources.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(phase === 'before' ? path.join(directory, 'before') : root, file))).digest('hex')]))
if (phase === 'after') for (const file of ['src/features/canvas/wireNodeGeometry.ts', 'src/features/canvas/wireRoutingPeers.ts', 'src/features/canvas/components/ProbeVoltageTooltip.tsx']) hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')
const html = '<!doctype html><html><body><div id="root"></div><script type="module" src="/scripts/fixtures/render-isolation-entry.tsx"></script></body></html>'
const plugin = { name: 'render-isolation-audit', enforce: 'pre', transform(source, id) {
  const file = path.relative(root, id).replaceAll('\\', '/')
  if (phase === 'before' && sources.includes(file)) source = fs.readFileSync(path.join(directory, 'before', file), 'utf8')
  const bump = (kind, key = "'all'") => `globalThis.__renderAudit?.bump('${kind}', ${key});\n`
  if (file.endsWith('/CircuitCanvas.tsx')) {
    source = source.replace('  const scale = viewport.scale || 1;', bump('grid') + '  const scale = viewport.scale || 1;')
    source = source.replace('  const { wiringColor,', bump('toolbar') + '  const { wiringColor,')
    source = source.replace('  const isDark = useThemeStore', bump('canvas') + '  const isDark = useThemeStore')
    source = source.replace('  const node = useCanvasStore((state) => state.nodesById.get(id));', bump('wrapper', 'id') + '  const node = useCanvasStore((state) => state.nodesById.get(id));')
  }
  if (file.endsWith('/ComponentNode.tsx')) source = source.replace('  const shapeRef =', bump('component', 'node.id') + '  const shapeRef =')
  if (file.endsWith('/WireShape.tsx')) source = source.replace('  const [hovered,', bump('wire', 'wire.id') + '  const [hovered,')
  if (file.endsWith('/PinDot.tsx')) source = source.replace('  const [hovered,', bump('pin', 'nodeId + ":" + pin.id') + '  const [hovered,')
  if (file.endsWith('/wireRouting.ts')) {
    const offset = source.indexOf('export function getWireRenderPoints('), body = source.indexOf('  const from =', offset)
    assert(offset >= 0 && body > offset); source = source.slice(0, body) + bump('routePoints', 'wire.id') + source.slice(body)
  }
  return source
}, configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (!req.headers.accept?.includes('text/html')) return next()
  res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html))
}) } }
let server
if (production) {
  const input = path.join(directory, 'index.html'), outDir = path.join(directory, 'dist'); fs.writeFileSync(input, html)
  await build({ root, configFile: false, logLevel: 'error', plugins: [plugin], build: { outDir, emptyOutDir: true, rollupOptions: { input } } })
  const files = fs.readdirSync(outDir, { recursive: true }).filter(f => f.endsWith('index.html')); assert.equal(files.length, 1); fs.copyFileSync(path.join(outDir, files[0]), path.join(outDir, 'index.html'))
  const p = await preview({ root, configFile: false, build: { outDir }, preview: { host: 'localhost', port: 3113, strictPort: true } })
  server = { listen: async () => {}, close: () => new Promise(resolve => p.httpServer.close(resolve)) }
} else server = await createServer({ root, server: { host: 'localhost', port: 3113, strictPort: true }, plugins: [plugin] })
const checks = [], samples = [], errors = []
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), values } }
const check = async (name, fn) => { try { await fn(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (e) { checks.push({ name, passed: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message) } }
let browser, failure
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  await context.addInitScript(() => {
    const a = window.__renderAudit = { counts: {}, latencies: [], drawCpu: [], lastMove: 0, bump(kind, id) { const bucket = a.counts[kind] ||= {}; bucket[id] = (bucket[id] || 0) + 1 } }
    window.addEventListener('mousemove', event => { if (a.measuring && event.buttons === 1) { a.lastMove = performance.now(); a.lastDraw = 0 } }, true)
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin, { waitUntil: 'networkidle' })
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const load = async () => { await page.evaluate(() => window.__renderAudit.load()); await page.waitForFunction(() => window.__renderAudit.store.getState().routingStatus.phase === 'ready'); await paint() }
  await load()
  const reset = () => page.evaluate(() => { window.__renderAudit.counts = {} })
  const counts = () => page.evaluate(() => window.__renderAudit.counts)
  const snapshot = async (name, action) => { await reset(); await action(); await paint(); const result = { name, counts: await counts() }; samples.push(result); console.log(JSON.stringify({ name, counts: Object.fromEntries(Object.entries(result.counts).map(([key, values]) => [key, { instances: Object.keys(values).length, calls: Object.values(values).reduce((a, b) => a + b, 0) }])) })); return result.counts }
  await page.mouse.move(1300, 750)
  const select = await snapshot('select one wire', () => page.evaluate(() => window.__renderAudit.store.getState().selectWire('w-50')))
  await page.evaluate(() => window.__renderAudit.store.getState().selectWire(null)); await paint()
  const runtime = await snapshot('one runtime property update', () => page.evaluate(() => window.__renderAudit.store.getState().updateRuntimeNode('r-50', { properties: { isActive: true } })))
  const edit = await snapshot('one authored electrical property update', () => page.evaluate(() => { const s = window.__renderAudit.store.getState(); s.updateNode('r-50', { properties: { ...s.nodesById.get('r-50').properties, resistance: 2000 } }) }))
  const color = await snapshot('one wire color update', () => page.evaluate(() => window.__renderAudit.store.getState().updateWire('w-50', { color: '#ff0000' })))
  const pan = await snapshot('pan without changing mounted membership', () => page.evaluate(() => window.__renderAudit.store.getState().setViewport({ x: 10, y: 0, scale: .65 })))
  await page.evaluate(() => { const s = window.__renderAudit.store.getState(); s.startWiring('r-0', 'p1') }); await paint()
  const preview = await snapshot('move wiring preview', async () => { await page.mouse.move(1050, 500); await page.mouse.move(1070, 510) })
  await page.evaluate(() => window.__renderAudit.store.getState().cancelWiring()); await paint()
  if (phase === 'after') {
    await check('Wire selection updates one wire and leaves the grid, toolbar and unrelated components alone', () => { assert.deepEqual(Object.keys(select.wire || {}), ['w-50']); assert(!select.grid && !select.toolbar); assert(Object.keys(select.component || {}).every(id => ['r-50', 'r-51'].includes(id))) })
    await check('Runtime and electrical-property updates avoid unrelated wire routing and toolbar renders', () => { for (const c of [runtime, edit]) { assert(!c.wire && !c.routePoints && !c.toolbar && !c.grid); assert.deepEqual(Object.keys(c.component || {}), ['r-50']) } })
    await check('Pan and wiring-preview movement do not rerender stable wires or recompute their paths', () => { for (const c of [pan, preview]) assert(!c.wire && !c.routePoints); assert(!preview.grid && !preview.toolbar) })
    await check('A wire style edit leaves every unrelated wire and pin unchanged', () => { assert.deepEqual(Object.keys(color.wire || {}), ['w-50']); assert(!color.pin && !color.component && !color.toolbar && !color.grid) })
  }
  await load(); await reset()
  await page.evaluate(() => {
    const a = window.__renderAudit, draw = a.Konva.Layer.prototype.draw
    a.Konva.Layer.prototype.draw = function (...args) { const started = performance.now(), result = draw.apply(this, args); if (a.measuring) { a.drawCpu.push({ layer: this.index, ms: performance.now() - started }); if (a.lastMove) a.lastDraw = performance.now() } return result }
  })
  const cdp = profile ? await context.newCDPSession(page) : null
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  await page.mouse.move(76, 60); await page.mouse.down()
  await page.evaluate(() => { window.__renderAudit.measuring = true })
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(90 + i * 3, 75 + i * 2); await paint()
    await page.evaluate(() => { const a = window.__renderAudit; if (a.lastDraw > a.lastMove) a.latencies.push(a.lastDraw - a.lastMove) })
  }
  await page.mouse.up(); await paint()
  await page.evaluate(() => { window.__renderAudit.measuring = false })
  if (cdp) fs.writeFileSync(path.join(reports, `vfopt-ui-015-${phase}-${mode}.cpuprofile`), JSON.stringify((await cdp.send('Profiler.stop')).profile))
  const gesture = await page.evaluate(() => { const a = window.__renderAudit; return { counts: a.counts, latencies: a.latencies, drawCpu: a.drawCpu, dragging: a.store.getState().draggingNodeId, viewport: a.store.getState().viewport, node: a.store.getState().nodesById.get('r-0') } })
  samples.push({ name: 'native component drag', ...gesture, inputToLastDrawMs: stats(gesture.latencies), componentLayerDrawCpuMs: stats(gesture.drawCpu.filter(d => d.layer === 1).map(d => d.ms)) })
  console.log(JSON.stringify({ name: 'native component drag', inputToLastDrawMs: stats(gesture.latencies), componentLayerDrawCpuMs: stats(gesture.drawCpu.filter(d => d.layer === 1).map(d => d.ms)) }))
  if (phase === 'after') await check('Dense native drag meets 50 ms p95 with intact gesture completion and viewport', () => { assert.equal(gesture.dragging, null); assert.deepEqual(gesture.viewport, { x: 0, y: 0, scale: .65 }); assert.notEqual(gesture.node.x, 80); assert(gesture.latencies.length >= 20); assert(stats(gesture.latencies).p95 <= 50) })
  if (phase === 'after') {
    const wirePoint = async id => page.evaluate(id => {
      const a = window.__renderAudit, stage = a.Konva.stages[0], line = stage.findOne(n => n.name() === 'schematic-wire' && n.id() === id)
      if (!line) throw Error('Missing visible wire ' + id)
      const pts = line.points()
      for (let i = 0; i < pts.length - 2; i += 2) for (const t of [.5, .25, .75]) {
        const p = line.getAbsoluteTransform().point({ x: pts[i] + (pts[i + 2] - pts[i]) * t, y: pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t })
        if (stage.getIntersection(p) === line) return p
      }
      throw Error('No unobstructed hit target for ' + id)
    }, id)
    const sceneTexts = () => page.evaluate(() => window.__renderAudit.Konva.stages[0].find('Text').map(n => n.text()))
    const assertWireGeometry = async id => assert(await page.evaluate(id => {
      const a = window.__renderAudit, s = a.store.getState(), wire = s.wires.find(w => w.id === id), line = a.Konva.stages[0].findOne(n => n.name() === 'schematic-wire' && n.id() === id)
      return JSON.stringify(line.points()) === JSON.stringify(a.getWireRenderPoints(wire, s.nodes, wire.bendPoints, s.wires))
    }, id), `Stale geometry for ${id}`)
    await check('Native wire selection uses the current wire ID after prior selections and edits', async () => {
      await load()
      for (const id of ['w-0', 'w-20']) { const p = await wirePoint(id); await page.mouse.click(p.x, p.y); await paint(); assert.equal(await page.evaluate(() => window.__renderAudit.store.getState().selectedWireId), id) }
    })
    await check('Endpoint movement, rotation/resize, retargeting and peer additions preserve the full-router output', async () => {
      await load()
      await page.evaluate(() => { const s = window.__renderAudit.store.getState(); s.updateNode('r-0', { x: 100, rotation: 90, width: 120, height: 30, pins: s.nodes[0].pins.map(p => ({ ...p, x: p.x * 1.2 })) }) }); await paint(); await assertWireGeometry('w-0')
      await page.evaluate(() => window.__renderAudit.store.getState().updateWire('w-0', { fromNodeId: 'r-2', fromPinId: 'p1' })); await paint(); await assertWireGeometry('w-0')
      await page.evaluate(() => { const s = window.__renderAudit.store.getState(); s.addWire({ ...s.wires[0], id: 'new-peer' }) }); await paint()
      await assertWireGeometry('w-0'); await assertWireGeometry('new-peer')
      await page.evaluate(() => window.__renderAudit.store.getState().removeWire('new-peer')); await paint(); await assertWireGeometry('w-0')
    })
    await check('Native bend preview updates only its wire, commits correctly and respects read-only mode', async () => {
      await load(); await page.evaluate(() => window.__renderAudit.store.getState().updateWire('w-0', { routingMode: 'curved', bendPoints: [] })); await paint()
      const p = await wirePoint('w-0'); await page.mouse.dblclick(p.x, p.y); await paint(); await reset()
      await page.mouse.move(p.x + 10, p.y + 25); await paint()
      const c = await counts(); assert.deepEqual(Object.keys(c.wire || {}), ['w-0']); assert(!c.grid && !c.toolbar)
      await page.mouse.down(); await page.mouse.up(); await paint()
      assert.equal(await page.evaluate(() => window.__renderAudit.store.getState().wires[0].bendPoints.length), 1); await assertWireGeometry('w-0')
      await page.evaluate(() => { window.__renderAudit.store.getState().updateWire('w-0', { bendPoints: [] }); window.__renderAudit.setReadOnly(true) }); await paint()
      const ro = await wirePoint('w-0'); await page.mouse.dblclick(ro.x, ro.y); await page.mouse.move(ro.x + 10, ro.y + 25); await page.mouse.down(); await page.mouse.up(); await paint()
      assert.equal(await page.evaluate(() => window.__renderAudit.store.getState().wires[0].bendPoints.length), 0)
      await page.evaluate(() => window.__renderAudit.setReadOnly(false)); await paint()
    })
    await check('Wire hover probe stays live without rerendering wire geometry on runtime updates', async () => {
      await load(); await page.evaluate(() => { window.__renderAudit.setProbe(true); globalThis.__voltforgePinVoltages = { 'r-0:p2': 1.25 } }); await paint()
      const p = await wirePoint('w-0'); await page.mouse.move(p.x, p.y); await paint(); assert((await sceneTexts()).includes('1.250 V'))
      await reset(); await page.evaluate(() => { globalThis.__voltforgePinVoltages['r-0:p2'] = 3.3; window.__renderAudit.store.getState().updateRuntimeNode('r-0', { properties: { voltage: 3.3 } }) }); await paint()
      assert((await sceneTexts()).includes('3.300 V')); const c = await counts(); assert(!c.wire && !c.routePoints && !c.pin)
      await page.evaluate(() => window.__renderAudit.setProbe(false)); await page.mouse.move(1300, 750); await paint()
    })
    await check('Pin hover probe stays live while unrelated pins and wires retain their render state', async () => {
      await load(); await page.evaluate(() => { window.__renderAudit.setProbe(true); globalThis.__voltforgePinVoltages = { 'r-0:p1': 2.5 } }); await paint()
      const p = await page.evaluate(() => window.__renderAudit.Konva.stages[0].findOne(n => n.id() === 'r-0:p1').findOne('Circle').getAbsolutePosition())
      await page.mouse.move(p.x, p.y); await paint(); assert((await sceneTexts()).includes('2.500 V'))
      await reset(); await page.evaluate(() => { globalThis.__voltforgePinVoltages['r-0:p1'] = 4.5; window.__renderAudit.store.getState().updateRuntimeNode('r-0', { properties: { voltage: 4.5 } }) }); await paint()
      assert((await sceneTexts()).includes('4.500 V')); const c = await counts(); assert(!c.pin && !c.wire && !c.routePoints)
      await page.evaluate(() => window.__renderAudit.setProbe(false)); await page.mouse.move(1300, 750); await paint()
    })
    await check('Toolbar mode/color, theme and read-only guards remain reactive through memo boundaries', async () => {
      await load(); await page.evaluate(() => { const s = window.__renderAudit.store.getState(); s.startWiring('r-0', 'p1'); s.setWiringColor('#ff0000'); s.setWiringMode('curved') }); await paint()
      assert.equal(await page.locator('.vf-wire-toolbar__mode').innerText(), 'Curved')
      await page.locator('.vf-wire-toolbar__mode').click(); assert.equal(await page.evaluate(() => window.__renderAudit.store.getState().wiringMode), 'straight')
      await page.evaluate(() => { window.__renderAudit.store.getState().cancelWiring(); window.__renderAudit.theme.setState({ theme: 'dark' }) }); await paint()
      assert.equal(await page.evaluate(() => window.__renderAudit.Konva.stages[0].getLayers()[0].findOne('Rect').fill()), '#000000')
      await page.evaluate(() => window.__renderAudit.setReadOnly(true)); await paint()
      assert.equal(await page.evaluate(() => window.__renderAudit.Konva.stages[0].findOne('#r-0').draggable()), false)
      await page.evaluate(() => { window.__renderAudit.setReadOnly(false); window.__renderAudit.theme.setState({ theme: 'light' }) }); await paint()
    })
  }
  await load(); await page.mouse.move(1300, 750); await paint()
  await page.screenshot({ path: path.join(reports, `vfopt-ui-015-${phase}-${mode}.png`) })
  assert.deepEqual(errors, []); assert(checks.every(c => c.passed), 'Render isolation checks failed')
} catch (e) { failure = e; console.error(e.stack) }
finally {
  const report = path.join(reports, `vfopt-ui-015-${phase}-${mode}.json`)
  if (fs.existsSync(report)) fs.copyFileSync(report, report.replace('.json', `-${Date.now()}-previous.json`))
  fs.writeFileSync(report, JSON.stringify({ task: 'VFOPT-UI-015', phase, mode, profile, browser: browser?.version(), capturedAt: new Date().toISOString(), sourceHashes: hashes, samples, checks, errors, failure: failure?.message ?? null }, null, 2) + '\n')
  await browser?.close(); await server.close()
}
if (failure) process.exitCode = 1
