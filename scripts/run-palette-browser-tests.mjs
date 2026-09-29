import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build, createServer, preview } from 'vite'
import ts from 'typescript'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const phase = process.argv.includes('--before') ? 'before' : 'after'
const production = process.argv.includes('--production'), coverageOnly = process.argv.includes('--coverage-only')
const cache = path.join(root, 'node_modules/.cache/vfopt-palette-browser')
const mode = production ? 'production' : 'development'
const reportName = coverageOnly ? `vfopt-x-001-f007-${phase}-${mode}` : `vfopt-ui-012-palette-${phase}${production ? '-production' : ''}`
const output = path.join(root, 'docs/reports'), origin = 'http://localhost:3104'
const checks = [], measurements = {}, errors = [], requests = []
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let browser
let coverageRequests = 0, coverageStatus = 500, coverageGate, releaseCoverage
const html = '<!doctype html><html><head><title>Palette audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/palette-entry.tsx"></script></body></html>'
const plugin = {
  name: 'palette-audit-only', enforce: 'pre',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes('text/html')) return next()
      response.setHeader('Content-Type', 'text/html'); response.end(await vite.transformIndexHtml(request.url, html))
    })
  },
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/features/editor/ComponentPanel.tsx')) return
    const tree = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), insertions = []
    function inspect(node) {
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name && ['ComponentPanel', 'ComponentStudioLauncher'].includes(node.name.text) && node.body) {
        insertions.push({ position: node.body.getStart(tree) + 1, text: `\n__auditLayoutEffect(() => { const a = window.__paletteAudit; a.commits['${node.name.text}'] = (a.commits['${node.name.text}'] || 0) + 1; });\n` })
      }
      ts.forEachChild(node, inspect)
    }
    inspect(tree)
    for (const insertion of insertions.sort((a,b) => b.position-a.position)) code = code.slice(0,insertion.position) + insertion.text + code.slice(insertion.position)
    return { code: "import { useLayoutEffect as __auditLayoutEffect } from 'react';\n" + code, map: null }
  },
}
let server
if (production) {
  process.env.NODE_ENV = 'production'
  fs.mkdirSync(cache, { recursive: true })
  const input = path.join(cache, 'index.html'), outDir = path.join(cache, 'dist')
  fs.writeFileSync(input, html)
  await build({ root, configFile: false, logLevel: 'error', plugins: [plugin], build: { outDir, emptyOutDir: true, rollupOptions: { input } } })
  const files = fs.readdirSync(outDir, { recursive: true }).filter(file => file.endsWith('index.html'))
  assert.equal(files.length, 1); fs.copyFileSync(path.join(outDir, files[0]), path.join(outDir, 'index.html'))
  const running = await preview({ root, configFile: false, build: { outDir }, preview: { host: 'localhost', port: 3104, strictPort: true } })
  server = { listen: async () => {}, close: () => new Promise(resolve => running.httpServer.close(resolve)) }
} else server = await createServer({ root, server: { host: 'localhost', port: 3104, strictPort: true }, plugins: [plugin] })
const check = async (name, action) => {
  try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
  catch (error) { checks.push({ name, passed: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message) }
}
const settle = page => page.waitForTimeout(150)
const reset = page => page.evaluate(() => { window.__paletteAudit.commits = {}; window.__paletteAudit.sorts = 0 })
const rows = page => page.locator('.vf-component-panel__item')

try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  await context.addInitScript(production => {
    window.__paletteAudit = { commits: {}, sorts: 0, typing: [], bundleTypes: [] }
    if (production) window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true,
      inject(renderer) { window.__paletteAudit.bundleTypes.push(renderer.bundleType); return 1 },
      onCommitFiberRoot() {}, onCommitFiberUnmount() {} }
    const original = Array.prototype.sort
    Array.prototype.sort = function (...args) {
      if (this[0]?.category && this[0]?.name && this[0]?.type) window.__paletteAudit.sorts++
      return original.apply(this, args)
    }
    document.addEventListener('input', event => {
      if (!event.target.matches('.vf-component-panel__input')) return
      const started = performance.now()
      requestAnimationFrame(() => requestAnimationFrame(() => window.__paletteAudit.typing.push(performance.now() - started)))
    }, true)
  }, production)
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); requests.push(url.pathname)
    if (url.pathname.endsWith('/ai/component-coverage')) {
      coverageRequests++
      if (coverageGate) await coverageGate
      const data = { entries: [{ componentType: 'RESISTOR', status: 'verified', reason: 'Recovered coverage' }], summary: { verified: 1, variantRequired: 0, simulationOnly: 0 } }
      return route.fulfill({ status: coverageStatus, json: coverageStatus === 200 ? { success: true, data } : { success: false, message: 'Coverage unavailable' } })
    }
    if (url.pathname.includes('/api/v1/')) return route.fulfill({ status: 503, json: { success: false } })
    return url.origin === origin ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.stack || error.message))
  page.setDefaultTimeout(12000)
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__paletteAudit.store?.getState().componentLibrary.length === 1000)
  measurements.initial = await page.evaluate(() => ({ rows: document.querySelectorAll('.vf-component-panel__item').length, categories: document.querySelectorAll('.vf-component-panel__category-header').length, sorts: window.__paletteAudit.sorts, studioRequested: performance.getEntriesByType('resource').some(entry => /\/CustomComponentStudio(?:\.tsx|-[^/]+\.js)$/.test(entry.name)) }))
  console.log('Initial ' + JSON.stringify(measurements.initial))
  measurements.bundleTypes = await page.evaluate(() => window.__paletteAudit.bundleTypes)
  if (production) assert.deepEqual(measurements.bundleTypes, [0], 'Production React is required')
  if (!coverageOnly) {
  await check(phase === 'before' ? 'Record mounted rows for the 1000-component baseline' : 'Catalogue contains 1000 components with bounded mounted rows', async () => {
    assert.equal(await page.evaluate(() => window.__paletteAudit.store.getState().componentLibrary.length), 1000)
    if (phase === 'after') assert(measurements.initial.rows > 0 && measurements.initial.rows <= 40)
  })
  for (const kind of ['runtime', 'drag', 'selection', 'viewport']) {
    await reset(page)
    measurements[kind] = await page.evaluate(async kind => {
      const a = window.__paletteAudit
      for (let i=0; i<60; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        const state = a.store.getState()
        if (kind === 'runtime') state.updateRuntimeNode('runtime-led', { properties: { isLit: i % 2 === 0 } })
        if (kind === 'drag') state.updateNode('runtime-led', { x: 10 + i, y: 10 + i })
        if (kind === 'selection') state.selectNode(i % 2 === 0 ? 'runtime-led' : null)
        if (kind === 'viewport') state.setViewport({ x: i, y: i, scale: 1 })
      }
      await new Promise(resolve => requestAnimationFrame(resolve))
      return { updates: 60, commits: { ...a.commits }, sorts: a.sorts }
    }, kind)
    await check(kind + ' updates cause no palette commits or sorting', async () => { assert.deepEqual(measurements[kind].commits, {}); assert.equal(measurements[kind].sorts, 0) })
  }
  const input = page.getByPlaceholder('Search components...')
  await reset(page)
  await input.pressSequentially('Fixture component 00', { delay: 40 })
  await settle(page)
  measurements.search = await page.evaluate(() => {
    const a = window.__paletteAudit, ordered = [...a.typing].sort((a,b) => a-b)
    return { keystrokes: a.typing.length, eventToSecondFrameMs: a.typing, p95Ms: ordered[Math.ceil(ordered.length*.95)-1], sorts: a.sorts, rows: document.querySelectorAll('.vf-component-panel__item').length }
  })
  console.log('Search ' + JSON.stringify(measurements.search))
  if (phase === 'after') {
    await check('Typing searches the cached catalogue within the 50 ms scheduling budget', async () => {
      assert.equal(measurements.search.sorts, 0); assert(measurements.search.p95Ms <= 50); assert(measurements.search.rows <= 40)
      assert.equal(await input.inputValue(), 'Fixture component 00')
    })
    await check('Every catalogue item is reachable across bounded pages', async () => {
      await input.fill(''); await settle(page)
      const seen = new Set(), pageSizes = []
      while (true) {
        const types = await rows(page).evaluateAll(elements => elements.map(element => element.dataset.componentType))
        pageSizes.push(types.length); assert(types.length > 0 && types.length <= 40)
        for (const type of types) { assert(!seen.has(type), 'Duplicate item across pages'); seen.add(type) }
        const next = page.getByRole('button', { name: 'Next components', exact: true })
        if (await next.isDisabled()) break
        await next.click(); await settle(page)
      }
      const expected = await page.evaluate(() => window.__paletteAudit.catalogue.map(component => component.type))
      assert.deepEqual([...seen].sort(), expected.sort())
      measurements.pagination = { pages: pageSizes.length, uniqueComponents: seen.size, maxRows: Math.max(...pageSizes) }
      await page.getByRole('button', { name: 'Previous components', exact: true }).focus()
      await page.keyboard.press('Enter'); await settle(page)
      assert.equal(await page.getByRole('button', { name: 'Next components', exact: true }).isDisabled(), false)
      assert.equal(await page.locator('.vf-component-panel__list').evaluate(element => element.scrollTop), 0)
    })
    await check('Search resets the page and matches names, types and descriptions', async () => {
      for (const query of ['  FIXTURE COMPONENT 0007  ', 'CUSTOM_FIXTURE_0007', 'token0007']) {
        await input.fill(query); await settle(page)
        assert.equal(await rows(page).count(), 1)
        assert.equal(await rows(page).first().getAttribute('data-component-type'), 'CUSTOM_FIXTURE_0007')
      }
      await input.fill('unmatched fixture phrase'); await settle(page)
      await page.getByText('No components found', { exact: true }).waitFor()
      assert.equal(await rows(page).count(), 0)
    })
    await check('Category browsing keeps every family accessible and search remains global', async () => {
      await input.fill(''); await settle(page)
      const category = page.getByRole('combobox', { name: 'Browse component category' })
      await category.selectOption('SENSOR'); await settle(page)
      assert.equal(await page.locator('.vf-component-panel__category-header').count(), 1)
      assert((await page.locator('.vf-component-panel__category-header').innerText()).includes('SENSOR'))
      await input.fill('Resistor'); await settle(page)
      assert.equal(await page.locator('[data-component-type="RESISTOR"]').count(), 1)
      assert.equal(await category.isDisabled(), true)
      await input.fill(''); await settle(page)
      assert.equal(await category.inputValue(), 'SENSOR')
      await category.selectOption(''); await settle(page)
    })
    await check('Collapsed categories cannot hide matching search results', async () => {
      await input.fill(''); await settle(page)
      const header = page.locator('.vf-component-panel__category-header').first()
      await header.click(); assert.equal(await header.getAttribute('aria-expanded'), 'false')
      await input.fill('ARDUINO_UNO'); await settle(page)
      assert(await rows(page).count() > 0)
      assert.equal(await page.locator('.vf-component-panel__category-header').first().getAttribute('aria-expanded'), 'true')
      await input.fill(''); await settle(page)
      assert.equal(await page.locator('.vf-component-panel__category-header').first().getAttribute('aria-expanded'), 'false')
      await page.locator('.vf-component-panel__category-header').first().click()
    })
    await check('Catalogue replacement clamps pagination and updates search entries', async () => {
      const next = page.getByRole('button', { name: 'Next components', exact: true })
      while (!await next.isDisabled()) { await next.click(); await settle(page) }
      await page.evaluate(() => {
        const a = window.__paletteAudit
        a.queryClient.setQueryData(['components'], [ ...a.catalogue.filter(c => !c.type.startsWith('CUSTOM_FIXTURE_')), { ...a.catalogue.find(c => c.type === 'CUSTOM_FIXTURE_0007'), name: 'New catalogue item', description: 'fresh-index-value' } ])
      })
      await settle(page)
      assert(await rows(page).count() > 0 && await rows(page).count() <= 40)
      assert.equal(await next.isDisabled(), true)
      const count = await page.evaluate(() => window.__paletteAudit.store.getState().componentLibrary.length)
      assert((await page.locator('.vf-component-panel__pagination').innerText()).includes(`${count} of ${count}`))
      await input.fill('fresh-index-value'); await settle(page)
      assert.equal(await rows(page).count(), 1); assert((await rows(page).first().innerText()).includes('New catalogue item'))
      await page.evaluate(() => { const a = window.__paletteAudit; a.queryClient.setQueryData(['components'], a.catalogue) })
    })
    await check('Coverage metadata updates retain badges without sorting the catalogue', async () => {
      await input.fill('Resistor'); await settle(page); await reset(page)
      await page.evaluate(() => { const a = window.__paletteAudit; a.queryClient.setQueryData(['ai', 'component-coverage'], { ...a.coverage, entries: [{ componentType: 'RESISTOR', status: 'simulation-only', reason: 'Updated coverage reason' }] }) })
      await settle(page)
      assert.equal(await page.locator('[data-component-type="RESISTOR"]').getAttribute('title'), 'Updated coverage reason')
      assert.equal(await page.evaluate(() => window.__paletteAudit.sorts), 0)
    })
    await check('Keyboard activation adds the correct component at the current viewport', async () => {
      await page.evaluate(() => window.__paletteAudit.store.getState().setViewport({ x: 100, y: 50, scale: 2 }))
      await page.locator('[data-component-type="RESISTOR"]').focus(); await page.keyboard.press('Enter')
      const node = await page.evaluate(() => window.__paletteAudit.store.getState().nodes.at(-1))
      assert.equal(node.type, 'RESISTOR'); assert.equal(node.x, 100); assert.equal(node.y, 100)
    })
    await check('Read-only mode keeps search available and prevents insertion and creation', async () => {
      await page.evaluate(() => window.__paletteAudit.setReadOnly(true)); await settle(page)
      assert.equal(await rows(page).first().isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: 'Create custom component', exact: true }).count(), 0)
      await input.fill('token0007'); await settle(page); assert.equal(await rows(page).count(), 1)
      await page.evaluate(() => window.__paletteAudit.setReadOnly(false)); await settle(page)
    })
    await check('Studio loads on demand and preserves drafts across close and reopen', async () => {
      assert.equal(measurements.initial.studioRequested, false)
      await page.getByRole('button', { name: 'Create custom component', exact: true }).click()
      const name = page.getByPlaceholder('e.g. Temperature Sensor')
      await name.fill('Retained palette draft')
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'Create custom component', exact: true }).click()
      assert.equal(await name.inputValue(), 'Retained palette draft')
      await page.keyboard.press('Escape')
      assert(requests.some(request => /\/CustomComponentStudio(?:\.tsx|-[^/]+\.js)$/.test(request)))
    })
    await check('Narrow palette retains visible paging controls without horizontal overflow', async () => {
      await input.fill(''); await settle(page)
      await page.locator('#root > div').evaluate(element => { element.style.width = '220px' })
      await settle(page)
      const dimensions = await page.locator('.vf-component-panel').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }))
      assert(dimensions.scrollWidth <= dimensions.width)
      const footer = await page.locator('.vf-component-panel__pagination').boundingBox()
      assert(footer.y + footer.height <= 768)
      await page.screenshot({ path: path.join(output, 'vfopt-ui-012-palette-narrow.png') })
      await page.locator('#root > div').evaluate(element => { element.style.width = '272px' })
    })
  }
  await input.fill(''); await settle(page)
  await page.screenshot({ path: path.join(output, `${reportName}.png`) })
  }
  const mount = async value => {
    await page.evaluate(value => window.__paletteAudit.setMounted(value), value)
    await page.locator('.vf-component-panel').waitFor({ state: value ? 'visible' : 'detached' })
  }
  await mount(false)
  await page.evaluate(() => {
    const a = window.__paletteAudit
    a.queryClient.removeQueries({ queryKey: ['ai', 'component-coverage'], exact: true })
    // Match the application's one retry; shorten only the delay. Exercise focus too.
    a.queryClient.setQueryDefaults(['ai', 'component-coverage'], {
      retry: 1, retryDelay: 50, staleTime: 0, refetchOnMount: true,
      refetchOnWindowFocus: true, refetchOnReconnect: true,
    })
  })
  for (let i = 0; i < 5; i++) {
    await mount(true); await page.waitForTimeout(200)
    if (i < 4) await mount(false)
  }
  measurements.coverage = { mounts: 5, requestsAfterMounts: coverageRequests }
  const triggerAutomaticEvents = () => page.evaluate(async () => {
    const a = window.__paletteAudit
    a.focusManager.setFocused(false); a.focusManager.setFocused(true)
    a.onlineManager.setOnline(false); a.onlineManager.setOnline(true)
    await a.queryClient.invalidateQueries({ queryKey: ['ai', 'component-coverage'] })
  })
  await triggerAutomaticEvents(); await page.waitForTimeout(250)
  measurements.coverage.requestsAfterFocusReconnectInvalidation = coverageRequests
  if (phase === 'before') {
    await check('Reproduce automatic failed coverage traffic across ordinary palette visits', () => assert(coverageRequests >= 10))
  } else {
    await check('Repeated palette mounts, focus, reconnect and invalidation make zero coverage requests', async () => {
      assert.equal(coverageRequests, 0)
      await page.getByText('AI coverage not checked', { exact: true }).waitFor()
      assert.equal(await page.locator('.vf-component-panel__coverage-badge').count(), 0)
    })
    await check('An explicit check makes one request, disables repeat activation and does not retry a failure', async () => {
      coverageGate = new Promise(resolve => { releaseCoverage = resolve })
      await page.getByRole('button', { name: 'Check AI coverage', exact: true }).click()
      await page.getByText('Checking AI component coverage...', { exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Check AI coverage', exact: true }).isDisabled(), true)
      assert.equal(coverageRequests, 1)
      releaseCoverage(); coverageGate = undefined
      await page.getByText('AI component coverage unavailable', { exact: true }).waitFor()
      await page.waitForTimeout(250); assert.equal(coverageRequests, 1)
    })
    await check('Unavailable coverage does not block component search and keyboard placement', async () => {
      await page.getByPlaceholder('Search components...').fill('Resistor'); await settle(page)
      const before = await page.evaluate(() => window.__paletteAudit.store.getState().nodes.length)
      await page.locator('[data-component-type="RESISTOR"]').focus(); await page.keyboard.press('Enter')
      const result = await page.evaluate(() => ({ count: window.__paletteAudit.store.getState().nodes.length, type: window.__paletteAudit.store.getState().nodes.at(-1).type }))
      assert.equal(result.count, before + 1); assert.equal(result.type, 'RESISTOR')
    })
    await check('Cached unavailability stays quiet after remount and automatic events', async () => {
      for (let i = 0; i < 5; i++) { await mount(false); await mount(true); await page.waitForTimeout(100) }
      await triggerAutomaticEvents(); await page.waitForTimeout(250)
      assert.equal(coverageRequests, 1)
      await page.getByText('AI component coverage unavailable', { exact: true }).waitFor()
    })
    await check('Explicit retry recovers counts and badges when coverage becomes available', async () => {
      coverageStatus = 200
      await page.getByRole('button', { name: 'Retry AI coverage', exact: true }).click()
      await page.getByText('1 exact / 0 require a variant / 0 simulation-only', { exact: true }).waitFor()
      await page.getByPlaceholder('Search components...').fill('Resistor'); await settle(page)
      assert.equal(await page.locator('.vf-component-panel__coverage-badge').innerText(), 'AI exact')
      assert.equal(coverageRequests, 2)
    })
    await check('A failed refresh hides obsolete coverage badges and offers an explicit retry', async () => {
      coverageStatus = 503
      await page.getByRole('button', { name: 'Refresh AI coverage', exact: true }).click()
      await page.getByText('AI component coverage unavailable', { exact: true }).waitFor()
      await page.waitForTimeout(250)
      assert.equal(coverageRequests, 3)
      assert.equal(await page.locator('.vf-component-panel__coverage-badge').count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Retry AI coverage', exact: true }).isEnabled(), true)
    })
    await check('Evicting the optional query cache still does not fetch on a later visit', async () => {
      await mount(false)
      await page.evaluate(() => window.__paletteAudit.queryClient.removeQueries({ queryKey: ['ai', 'component-coverage'], exact: true }))
      await mount(true); await page.waitForTimeout(250)
      await page.getByText('AI coverage not checked', { exact: true }).waitFor()
      assert.equal(coverageRequests, 3)
    })
  }
  measurements.coverage.finalRequests = coverageRequests
} catch (error) {
  checks.push({ name: 'Harness completed', passed: false, error: error.stack || error.message })
  console.error(error)
} finally {
  releaseCoverage?.()
  const report = { task: coverageOnly ? 'VFOPT-X-001-F007' : 'VFOPT-UI-012', phase, capturedAt: new Date().toISOString(), status: checks.some(check => !check.passed) || errors.length ? 'failed' : 'passed', fixtureSha256: sha(path.join(root, 'scripts/fixtures/palette-entry.tsx')), browser: browser?.version(), node: process.version, measurements, checks, errors, sourceEvidence: ['src/features/editor/ComponentPanel.tsx', 'src/styles/editor.css'].map(file => ({ file, sha256: sha(path.join(root, file)) })), conditions: { catalogueSize: 1000, mode: `Vite ${mode}; actual ComponentPanel, canvas store and custom studio; isolated query cache and intercepted coverage HTTP 500/503/200 responses`, timing: 'Actual input event to second animation frame is a scheduling proxy, not pixel paint or total CPU attribution', powerMode: 'not recorded', backgroundActivity: 'not controlled' } }
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, `${reportName}.json`), JSON.stringify(report, null, 2) + '\n')
  await browser?.close(); await server.close()
  if (production) {
    assert(path.resolve(cache).startsWith(path.resolve(root, 'node_modules/.cache') + path.sep))
    fs.rmSync(cache, { recursive: true, force: true })
  }
}
assert(checks.every(check => check.passed) && errors.length === 0, 'Palette browser regression failed')
