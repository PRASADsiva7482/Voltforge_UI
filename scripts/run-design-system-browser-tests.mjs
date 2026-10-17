// Isolated browser fixtures exercise real routes. No fixture auth or data ships in the app.
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, 'docs/reports/visual-identity')
fs.mkdirSync(output, { recursive: true })
const user = { id: 'fixture-user', keycloakId: 'fixture-user', username: 'engineer', displayName: 'Test Engineer', email: 'engineer@example.test', role: 'USER', accountStatus: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' }
const projects = Array.from({ length: 6 }, (_, i) => ({ id: `fixture-${i}`, name: ['Bench power supply', 'Environmental sensor', 'Motor controller', 'LED signal study', 'Temperature logger', 'Logic experiment'][i], boardType: i % 2 ? 'ESP32' : 'ARDUINO_UNO', description: 'Browser test fixture circuit', isPublic: i % 2 === 0, forkCount: 0, viewCount: 0, updatedAt: '2026-10-16T10:00:00Z', createdAt: '2026-10-01T10:00:00Z', tags: 'test' }))
const server = await createServer({ root, server: { host: 'localhost', port: 3117, strictPort: true }, plugins: [{ name: 'design-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop = () => {}; return <AuthContext.Provider value={{user: ${JSON.stringify(user)}, isAuthenticated: true, isLoading: false, isRedirecting: false, error: null, login: noop, logout: noop, signup: noop, changePassword: noop, configureTotp: noop, manageAccount: noop}}>{children}</AuthContext.Provider> }`
} }] })
let browser
const checks = [], errors = []
const check = async (name, action) => { try { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) } catch (e) { checks.push({ name, passed: false, error: e.message }); console.error('FAIL ' + name + ': ' + e.message) } }
try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' })
  let mode = 'loaded', deletions = 0
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const pathname = url.pathname
    if (pathname.startsWith('/src/')) return route.continue()
    if (route.request().method() === 'DELETE') { deletions++; return route.fulfill({ json: { success: true, data: null } }) }
    if (pathname.includes('/users/')) return route.fulfill({ json: { success: true, data: user } })
    if (pathname.includes('/projects')) {
      if (mode === 'error') return route.fulfill({ status: 503, json: { success: false, message: 'Test service unavailable' } })
      const content = mode === 'empty' || url.searchParams.get('query') === 'unmatched' ? [] : projects
      if (/\/projects\/fixture-0$/.test(pathname)) return route.fulfill({ json: { success: true, data: { ...projects[0], owner: user, documentRevision: 'fixture-revision', canvasLayout: { nodes: [], wires: [], viewport: { x: 0, y: 0, scale: 1 } }, codeFiles: [{ id: 'fixture-code', filename: 'main.ino', language: 'cpp', content: 'void setup() {}\nvoid loop() {}', sortOrder: 0 }] } } })
      return route.fulfill({ json: { success: true, data: { content, totalElements: content.length, totalPages: 1, first: true, last: true, page: 0, size: 24 } } })
    }
    if (pathname.includes('/components')) return route.fulfill({ json: { success: true, data: [] } })
    return route.fulfill({ status: 503, json: { success: false, message: 'Unavailable in browser fixture' } })
  })
  const page = await context.newPage()
  await check('Correct initial paint before React or CSS is downloaded', async () => {
    const cold = await context.newPage()
    await cold.route('**/src/main.tsx', route => route.abort())
    await cold.addInitScript(() => localStorage.setItem('voltforge-theme', JSON.stringify({ state: { theme: 'dark' } })))
    await cold.goto('http://localhost:3117/')
    assert.equal(await cold.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(23, 24, 22)')
    await cold.evaluate(() => localStorage.removeItem('voltforge-theme'))
    await cold.close()
  })
  page.on('pageerror', e => errors.push(e.message))
  const visit = async route => { await page.goto('http://localhost:3117' + route); await page.waitForTimeout(650) }
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await check('System theme, explicit toggle, persistence, system changes', async () => {
    await visit('/dashboard')
    await page.getByText('Bench power supply', { exact: true }).waitFor()
    assert.equal(await bg(), 'rgb(23, 24, 22)')
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
    assert.equal(await bg(), 'rgb(244, 241, 232)')
    await page.reload(); await page.getByText('Bench power supply', { exact: true }).waitFor()
    assert.equal(await bg(), 'rgb(244, 241, 232)')
    await page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await bg(), 'rgb(244, 241, 232)')
    await visit('/settings'); await page.getByRole('tab', { name: 'Preferences', exact: true }).click()
    await page.getByLabel('Appearance').selectOption('system')
    assert.equal(await bg(), 'rgb(23, 24, 22)')
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(100)
    assert.equal(await bg(), 'rgb(244, 241, 232)')
  })
  await check('Dashboard filters, no-results, and clear action', async () => {
    await visit('/dashboard'); await page.getByLabel('Filter recent projects').fill('unmatched')
    await page.getByText('No matching projects', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Clear filter', exact: true }).click()
    assert.equal(await page.locator('.project-ledger__row').count(), 6)
  })
  await check('Project validation, destructive dialog focus and cancellation', async () => {
    await visit('/projects/new'); await page.getByLabel('Project name', { exact: true }).fill('   ')
    assert(await page.getByRole('button', { name: 'Create project', exact: true }).isDisabled())
    await visit('/projects'); await page.getByRole('button', { name: 'Actions for project', exact: true }).first().click()
    await page.getByRole('button', { name: 'Delete project', exact: true }).click()
    const dialog = page.getByRole('dialog'); await dialog.waitFor()
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))) }
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0); assert.equal(deletions, 0)
    await page.waitForTimeout(50)
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Actions for project')
  })
  await check('Dashboard empty and service-error states', async () => {
    mode = 'empty'; await visit('/dashboard'); await page.getByText('Make your first connection', { exact: true }).waitFor()
    mode = 'error'; await visit('/dashboard'); await page.getByText('Could not load projects', { exact: true }).waitFor()
    assert.equal(await page.locator('.workspace-overview__metrics dd').first().innerText(), '—')
    mode = 'loaded'; await page.getByRole('button', { name: /retry/i }).click(); await page.getByText('Bench power supply', { exact: true }).waitFor()
  })
  await check('Monaco loads and follows the global theme', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await visit('/editor/sandbox?preset=led-blink')
    await page.locator('.monaco-editor').first().waitFor({ timeout: 45000 })
    const before = await page.locator('.monaco-editor').first().evaluate(el => getComputedStyle(el).backgroundColor)
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
    await page.waitForTimeout(200)
    const after = await page.locator('.monaco-editor').first().evaluate(el => getComputedStyle(el).backgroundColor)
    assert.notEqual(before, after)
    const sizes = await page.evaluate(() => ({ area: document.querySelector('.vf-editor__workspace').getBoundingClientRect().height, canvas: document.querySelector('.vf-editor__canvas-area canvas').getBoundingClientRect().height }))
    assert(Math.abs(sizes.area - sizes.canvas) <= 2, `Canvas must fill workspace: ${JSON.stringify(sizes)}`)
  })
  const routes = process.argv.includes('--interactions-only') ? [] : ['/dashboard', '/projects', '/projects/new', '/explore', '/labs', '/profile', '/settings', '/editor/sandbox?preset=led-blink', '/labs/lab-voltage-divider', '/']
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => localStorage.setItem('voltforge-theme', JSON.stringify({ state: { theme, preference: theme }, version: 0 })), theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const route of routes) await check(`${theme} ${width}px ${route}`, async () => {
        await visit(route)
        if (route.includes('editor') || route.startsWith('/labs/')) {
          await page.locator('canvas').first().waitFor({ timeout: 20000 })
          if (width === 1440 && route.includes('editor')) await page.locator('.monaco-editor').first().waitFor({ timeout: 45000 })
        }
        else await page.locator('h1').first().waitFor()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        await page.screenshot({ path: path.join(output, `${theme}-${width}-${route.replace(/[^a-z0-9]/gi, '_') || 'home'}.png`), fullPage: true })
        assert(overflow <= 2, 'Horizontal overflow: ' + overflow)
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const theme of ['light', 'dark']) await check(`${theme} owned editor tools and project settings`, async () => {
    await page.evaluate(theme => localStorage.setItem('voltforge-theme', JSON.stringify({ state: { theme, preference: theme }, version: 0 })), theme)
    await visit('/editor/fixture-0')
    const colors = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement)
      return Object.fromEntries(['primary', 'on-primary', 'text', 'text-muted', 'text-soft', 'surface-raised', 'bg'].map(name => [name, css.getPropertyValue('--vf-' + name).trim()]))
    })
    const luminance = hex => {
      const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
    }
    for (const [foreground, background] of [['on-primary', 'primary'], ['text', 'bg'], ['text-muted', 'surface-raised'], ['text-soft', 'surface-raised']]) {
      const a = luminance(colors[foreground]), b = luminance(colors[background])
      assert((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${theme} contrast ${foreground}/${background}`)
    }
    await page.getByRole('button', { name: /show.*tools|editor tools/i }).first().click()
    for (const label of ['Multimeter', 'Bill of materials', 'AI assistant', 'AI validator', 'IoT inspector', 'Solver and performance diagnostics']) {
      const button = page.getByRole('button', { name: label, exact: true })
      await button.click(); await page.waitForTimeout(350)
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      await page.screenshot({ path: path.join(output, `${theme}-panel-${label.replaceAll(' ', '-')}.png`) })
      await button.click()
    }
    await page.getByRole('button', { name: 'Project settings', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.screenshot({ path: path.join(output, `${theme}-project-settings.png`) })
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
  })
  await check('No uncaught route errors', async () => assert.deepEqual(errors, []))
} finally {
  await browser?.close(); await server.close()
  fs.writeFileSync(path.join(output, process.argv.includes('--interactions-only') ? 'interactions.json' : 'results.json'), JSON.stringify({ checks, errors }, null, 2))
}
if (checks.some(check => !check.passed)) process.exitCode = 1
