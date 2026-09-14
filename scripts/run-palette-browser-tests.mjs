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
const output = path.join(root, 'docs/reports'), origin = 'http://localhost:3104'
const checks = [], measurements = {}, errors = [], requests = []
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let browser
const server = await createServer({ root, server: { host: 'localhost', port: 3104, strictPort: true }, plugins: [{
  name: 'palette-audit-only', enforce: 'pre',
  configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.headers.accept?.includes('text/html')) return next()
      const html = await vite.transformIndexHtml(request.url, '<!doctype html><html><head><title>Palette audit</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/palette-entry.tsx"></script></body></html>')
      response.setHeader('Content-Type', 'text/html'); response.end(html)
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
}] })
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
  await context.addInitScript(() => {
    window.__paletteAudit = { commits: {}, sorts: 0, typing: [] }
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
  })
  await context.route('**/*', route => {
    const url = new URL(route.request().url()); requests.push(url.pathname)
    if (url.pathname.includes('/api/v1/')) return route.fulfill({ status: 503, json: { success: false } })
    return url.origin === origin ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(12000)
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__paletteAudit.store?.getState().componentLibrary.length === 1000)
  measurements.initial = await page.evaluate(() => ({ rows: document.querySelectorAll('.vf-component-panel__item').length, categories: document.querySelectorAll('.vf-component-panel__category-header').length, sorts: window.__paletteAudit.sorts, studioRequested: performance.getEntriesByType('resource').some(entry => entry.name.includes('/CustomComponentStudio.tsx')) }))
  console.log('Initial ' + JSON.stringify(measurements.initial))
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
      assert(requests.some(request => request.includes('/CustomComponentStudio.tsx')))
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
  await page.screenshot({ path: path.join(output, `vfopt-ui-012-palette-${phase}.png`) })
} finally {
  const report = { task: 'VFOPT-UI-012', phase, capturedAt: new Date().toISOString(), status: checks.some(check => !check.passed) || errors.length ? 'failed' : 'passed', fixtureSha256: sha(path.join(root, 'scripts/fixtures/palette-entry.tsx')), browser: browser?.version(), node: process.version, measurements, checks, errors, sourceEvidence: ['src/features/editor/ComponentPanel.tsx', 'src/styles/editor.css'].map(file => ({ file, sha256: sha(path.join(root, file)) })), conditions: { catalogueSize: 1000, mode: 'Vite development with StrictMode; actual ComponentPanel, canvas store and custom studio; isolated query cache and blocked external requests', timing: 'Actual input event to second animation frame is a scheduling proxy, not pixel paint or total CPU attribution', powerMode: 'not recorded', backgroundActivity: 'not controlled' } }
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, `vfopt-ui-012-palette-${phase}.json`), JSON.stringify(report, null, 2) + '\n')
  await browser?.close(); await server.close()
}
assert(checks.every(check => check.passed) && errors.length === 0, 'Palette browser regression failed')
