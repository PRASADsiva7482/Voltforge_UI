import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://localhost:3101'
const outputDir = path.join(root, 'docs/reports')
const results = []
const development = process.argv.includes('--dev')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(development ? [] : ['preview']), '--host', 'localhost', '--port', '3101', '--strictPort'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', data => { serverOutput += data })
server.stderr.on('data', data => { serverOutput += data })
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync)
let browser
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const publicProject = {
  id: 'auth-audit-public', name: 'Auth availability share', description: '', boardType: 'ARDUINO_UNO',
  canvasLayout: { nodes: [], wires: [], viewport: { x: 0, y: 0, scale: 1 } },
  componentConfig: {}, codeFiles: [], isPublic: true, owner: { id: 'another-owner', displayName: 'Fixture owner' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', viewCount: 0, forkCount: 0,
}
const token = payload => [
  Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(payload)).toString('base64url'), 'test-fixture-signature',
].join('.')

async function makePage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(15000)
  const record = { api: [], topLevelExternalNavigations: 0, tokenExchanges: 0, refreshes: 0, errors: [], consoleErrors: [], signInRedirect: null }
  const codes = new Map()
  page.on('pageerror', error => record.errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') record.consoleErrors.push(message.text().replace(/([?&#](?:code|state|nonce|code_challenge)=)[^&\s]+/g, '$1[redacted]'))
  })
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && frame.url().startsWith('http') && !frame.url().startsWith(origin)) record.topLevelExternalNavigations++
  })
  await page.addInitScript(() => {
    window.__authAudit = { longTasks: [], lcpMs: null }
    new PerformanceObserver(list => {
      window.__authAudit.longTasks.push(...list.getEntries().map(e => ({ startMs: e.startTime, durationMs: e.duration })))
    }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver(list => {
      window.__authAudit.lcpMs = list.getEntries().at(-1)?.startTime ?? null
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.includes('/api/v1/')) {
      const apiPath = url.pathname.slice(url.pathname.indexOf('/api/v1/') + 7)
      record.api.push({ path: apiPath, method: request.method(), hasBearer: Boolean(request.headers().authorization) })
      if (apiPath === '/auth/identity-health') {
        if (options.realIdentity) return route.continue()
        if (options.networkFailure || options.http404) return route.fulfill({ status: 503, json: { success: false } })
        if (options.discoveryStalls || options.probeStalls) return
        return route.fulfill({ json: { success: true, data: { available: true, issuer: options.mismatchedIssuer ? 'https://wrong.invalid/realms/test' : 'http://localhost:8080/realms/voltforge-realm' } } })
      }
      if (apiPath === '/auth/sync') {
        if (options.syncStalls) return // cancelled by the application's sync deadline
        if (options.syncFails) return route.fulfill({ status: 503, json: { success: false } })
        return route.fulfill({ json: { success: true, data: { id: 'fixture-user', keycloakId: 'fixture-user', displayName: 'Auth fixture user', username: 'fixture', role: 'USER' } } })
      }
      if (apiPath === '/projects/auth-audit-public') {
        if (options.project401) return route.fulfill({ status: 401, json: { success: false } })
        return route.fulfill({ json: { success: true, data: publicProject } })
      }
      // Optional AI services are unavailable in this app-only test environment.
      if (apiPath.startsWith('/ai/')) return route.fulfill({ status: 503, json: { success: false } })
      return route.fulfill({ json: { success: true, data: apiPath === '/projects' ? { content: [], totalElements: 0, totalPages: 0 } : [] } })
    }
    if (!url.pathname.includes('/realms/')) return route.continue()
    if (options.realIdentity) return route.continue()
    if (options.networkFailure) return route.abort('namenotresolved')
    if (options.http404) return route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Identity offline fixture</h1>' })
    if (url.pathname.endsWith('/3p-cookies/step1.html')) {
      if (options.discoveryStalls) return
      return route.fulfill({ contentType: 'text/html', body: `<script>parent.postMessage('${options.cookiesBlocked ? 'unsupported' : 'supported'}', '*')</script>` })
    }
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return route.fulfill({ json: { authorization_endpoint: url.origin + '/realms/fixture/protocol/openid-connect/auth' }, headers: { 'access-control-allow-origin': origin } })
    }
    if (url.pathname.endsWith('/token')) {
      const body = new URLSearchParams(request.postData() || '')
      const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }
      if (body.get('grant_type') === 'refresh_token') {
        record.refreshes++
        return route.fulfill({ status: 400, headers: cors, json: { error: 'invalid_grant' } })
      }
      record.tokenExchanges++
      assert.ok(body.get('code_verifier'), 'Real adapter must send a PKCE verifier')
      const nonce = codes.get(body.get('code'))
      assert.ok(nonce, 'Callback must correspond to a fixture-issued code')
      if (options.lateToken) await wait(4300)
      const now = Math.floor(Date.now() / 1000)
      const payload = { sub: 'fixture-user', preferred_username: 'fixture', name: 'Auth fixture user', iat: now, exp: now + (options.expiringToken ? 10 : 300), realm_access: { roles: ['user'] } }
      return route.fulfill({ headers: cors, json: { access_token: token(payload), refresh_token: token({ ...payload, exp: now + 600 }), id_token: token({ ...payload, nonce }), expires_in: 300, token_type: 'Bearer' } })
    }
    if (url.pathname.endsWith('/auth') || url.pathname.endsWith('/registrations')) {
      const silent = url.searchParams.get('prompt') === 'none'
      if (silent && options.silentStalls) return
      const callback = new URL(url.searchParams.get('redirect_uri'))
      if (silent && !options.signedIn) {
        callback.hash = new URLSearchParams({ error: 'login_required', state: url.searchParams.get('state') }).toString()
        return route.fulfill({ status: 302, headers: { location: callback.href } })
      }
      const code = 'fixture-code-' + codes.size
      codes.set(code, url.searchParams.get('nonce'))
      callback.hash = new URLSearchParams({ code, state: url.searchParams.get('state') }).toString()
      if (silent) return route.fulfill({ status: 302, headers: { location: callback.href } })
      record.signInRedirect = url.searchParams.get('redirect_uri')
      record.completeLoginUrl = callback.href // never written to the report
      return route.fulfill({ contentType: 'text/html', body: '<h1>Fixture sign-in page</h1>' })
    }
    return route.abort()
  })
  return { context, page, record }
}

async function run(name, options, check) {
  const filter = process.argv.slice(2).filter(arg => arg !== '--dev').join(' ').toLowerCase()
  if (filter && !name.toLowerCase().includes(filter)) return
  const fixture = await makePage(options)
  try {
    const extra = await check(fixture) || {}
    assert.deepEqual(fixture.record.errors, [], 'No unhandled page errors')
    assert.deepEqual(fixture.record.consoleErrors.filter(message => /Failed to load route chunk|The above error occurred/.test(message)), [], 'No React error boundary failures')
    const { completeLoginUrl: _secretCallback, ...safeRecord } = fixture.record
    results.push({ name, passed: true, identity: options.realIdentity ? 'configured real endpoint' : 'simulated protocol/network; real Keycloak adapter', ...safeRecord, ...extra })
    console.log('PASS ' + name)
  } catch (error) {
    results.push({ name, passed: false, error: error.message, pageErrors: fixture.record.errors, consoleErrors: fixture.record.consoleErrors, api: fixture.record.api })
    await fixture.page.screenshot({ path: path.join(outputDir, 'vfopt-ui-001-failure.png') }).catch(() => {})
    console.error('FAIL ' + name + ': ' + error.message)
  } finally {
    await fixture.context.close()
  }
}

async function home(page) {
  const started = Date.now()
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Build, simulate, ship circuits.' }).waitFor({ timeout: 5000 })
  return Date.now() - started
}
async function settledOnOrigin(page, milliseconds = 3900) {
  await page.waitForTimeout(milliseconds)
  assert.equal(new URL(page.url()).origin, origin)
}
async function privateGate(page, target = '/projects?sort=recent') {
  await page.goto(origin + target, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Sign in to continue' }).waitFor({ timeout: 10000 })
  assert.equal(new URL(page.url()).origin, origin)
}
async function navigateInApp(page, pathname) {
  await page.evaluate(target => {
    history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, pathname)
}

try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error('Preview failed: ' + serverOutput)
    try { if ((await fetch(origin)).ok) break } catch {}
    if (attempt === 49) throw new Error('Preview did not start')
    await wait(200)
  }
  fs.mkdirSync(outputDir, { recursive: true })
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })

  await run('Real configured identity: public homepage remains usable', { realIdentity: true }, async ({ page, record }) => {
    const headingVisibleMs = await home(page)
    await settledOnOrigin(page)
    assert.equal(record.topLevelExternalNavigations, 0)
    const before = await page.locator('html').getAttribute('class')
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    assert.notEqual(await page.locator('html').getAttribute('class'), before)
    await page.screenshot({ path: path.join(outputDir, 'vfopt-ui-001-home.png'), fullPage: true })
    return { headingVisibleMs, performance: await page.evaluate(() => window.__authAudit), viewport: { width: 1366, height: 768 } }
  })
  for (const [label, options] of [
    ['DNS failure', { networkFailure: true }], ['HTTP 404', { http404: true }],
    ['stalled discovery', { discoveryStalls: true }], ['stalled silent check', { silentStalls: true }],
    ['blocked third-party cookies', { cookiesBlocked: true }],
  ]) {
    await run(label + ': public content stays visible without redirect', options, async ({ page, record }) => {
      const headingVisibleMs = await home(page)
      await settledOnOrigin(page)
      assert.equal(record.topLevelExternalNavigations, 0)
      assert.equal(await page.locator('.auth-loader').count(), 0)
      assert.equal(await page.locator('iframe[title^="keycloak-"]').count(), 0)
      return { headingVisibleMs }
    })
  }
  await run('Offline explicit login and signup retain retry controls', { networkFailure: true }, async ({ page, record }) => {
    await home(page)
    await settledOnOrigin(page)
    for (const name of ['Login', 'Sign up']) {
      await page.getByRole('button', { name, exact: true }).first().click()
      await page.getByText('Sign-in is unavailable right now. Please try again in a moment.', { exact: true }).first().waitFor()
      await page.waitForFunction(() => !document.querySelector('.landing-nav button:disabled'))
      assert.equal(new URL(page.url()).origin, origin)
    }
    assert.equal(record.topLevelExternalNavigations, 0)
  })
  await run('Private route stays gated and can return home', { networkFailure: true }, async ({ page, record }) => {
    await privateGate(page, '/editor/private-audit?tab=code')
    assert.equal(record.api.length, 0, 'Private content must not fetch data before authentication')
    await page.screenshot({ path: path.join(outputDir, 'vfopt-ui-001-private-gate.png'), fullPage: true })
    await page.getByRole('link', { name: 'Back to home' }).click()
    await page.getByRole('heading', { name: 'Build, simulate, ship circuits.' }).waitFor()
  })
  for (const [name, options] of [['Mismatched issuer', { mismatchedIssuer: true }], ['Stalled availability probe', { probeStalls: true }]]) {
    await run(name + ': explicit sign-in stays bounded and retryable', options, async ({ page, record }) => {
      await home(page)
      await settledOnOrigin(page)
      await page.getByRole('button', { name: 'Login', exact: true }).first().click()
      await page.getByText('Sign-in is unavailable right now. Please try again in a moment.', { exact: true }).first().waitFor()
      await page.waitForFunction(() => !document.querySelector('.landing-nav button:disabled'))
      assert.equal(record.topLevelExternalNavigations, 0)
      assert(record.api.some(request => request.path === '/auth/identity-health' && !request.hasBearer))
    })
  }
  await run('Explicit login preserves deep link and processes real adapter callback', {}, async ({ page, record }) => {
    await privateGate(page)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Fixture sign-in page' }).waitFor()
    assert.equal(record.signInRedirect, origin + '/projects?sort=recent')
    await page.goto(record.completeLoginUrl)
    await page.waitForFunction(() => Boolean(document.querySelector('.app-shell')))
    await page.getByText('No projects found', { exact: true }).waitFor()
    assert.equal(page.url(), origin + '/projects?sort=recent')
    assert.equal(record.tokenExchanges, 1)
    assert.ok(record.api.some(r => r.path === '/projects' && r.hasBearer))
  })
  await run('Successful silent SSO keeps homepage visible', { signedIn: true }, async ({ page, record }) => {
    await home(page)
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor()
    assert.equal(record.tokenExchanges, 1)
    assert.equal(record.topLevelExternalNavigations, 0)
  })
  await run('Public encoded share loads without identity or bearer token', { networkFailure: true }, async ({ page, record }) => {
    const state = Buffer.from(JSON.stringify({ ...publicProject.canvasLayout, name: publicProject.name, codeFiles: [] })).toString('base64')
    await page.goto(origin + '/editor/share?state=' + encodeURIComponent(state))
    await page.getByText(publicProject.name, { exact: true }).first().waitFor({ timeout: 10000 })
    await page.locator('canvas').first().waitFor()
    await settledOnOrigin(page)
    assert.ok(record.api.every(r => !r.hasBearer))
    assert.equal(record.topLevelExternalNavigations, 0)
  })
  await run('Public database project loads anonymously; backend data is a fixture', { networkFailure: true }, async ({ page, record }) => {
    await page.goto(origin + '/public-project/auth-audit-public')
    await page.getByText(publicProject.name, { exact: true }).first().waitFor({ timeout: 10000 })
    await settledOnOrigin(page)
    await page.getByText(publicProject.name, { exact: true }).first().waitFor()
    await page.locator('canvas').first().waitFor()
    assert.ok(record.api.some(r => r.path === '/projects/auth-audit-public' && !r.hasBearer))
    assert.equal(record.topLevelExternalNavigations, 0)
  })
  for (const options of [{ syncFails: true }, { syncStalls: true }]) {
    await run('Account sync ' + (options.syncFails ? 'failure' : 'timeout') + ' does not open private content', { signedIn: true, ...options }, async ({ page, record }) => {
      await privateGate(page)
      await page.getByText('We could not prepare your account. Please try signing in again.').waitFor()
      assert.ok(record.api.every(r => r.path === '/auth/sync'))
    })
  }
  await run('Late token response cannot authenticate after the discovery deadline', { signedIn: true, lateToken: true }, async ({ page, record }) => {
    await privateGate(page)
    await settledOnOrigin(page, 2000)
    assert.equal(await page.locator('.app-shell').count(), 0)
    assert.equal(record.api.length, 0)
  })
  await run('Public 401 and failed refresh do not force navigation', { signedIn: true, expiringToken: true, project401: true }, async ({ page, record }) => {
    await home(page)
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor()
    await navigateInApp(page, '/public-project/auth-audit-public')
    await page.waitForTimeout(2500)
    assert.equal(new URL(page.url()).pathname, '/public-project/auth-audit-public')
    assert.ok(record.refreshes >= 1)
    assert.equal(record.topLevelExternalNavigations, 0)
    await navigateInApp(page, '/projects')
    await page.getByRole('heading', { name: 'Sign in to continue' }).waitFor()
  })
  await run('Periodic refresh failure keeps public content on screen', { signedIn: true, expiringToken: true }, async ({ page, record }) => {
    await page.clock.install()
    await home(page)
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor()
    await page.clock.fastForward(51_000)
    await page.getByRole('button', { name: 'Login', exact: true }).first().waitFor()
    assert.equal(record.refreshes, 1)
    assert.equal(record.topLevelExternalNavigations, 0)
    assert.equal(new URL(page.url()).origin, origin)
  })
  await run('Unknown callback state cannot bypass authentication', {}, async ({ page, record }) => {
    await privateGate(page, '/projects#state=untrusted-fixture&code=untrusted-fixture')
    assert.equal(record.tokenExchanges, 0)
    assert.equal(record.api.length, 0)
  })
} finally {
  const report = {
    task: 'VFOPT-UI-001', capturedAt: new Date().toISOString(), browser: browser ? await browser.version() : null,
    fullSuite: !process.argv.slice(2).some(arg => arg !== '--dev'), expectedFullSuiteScenarios: 20,
    buildMode: development ? 'development' : 'production-preview', viewport: { width: 1366, height: 768 },
    methodology: 'Real Chromium and installed Keycloak adapter. Network/protocol responses are fixtures except the explicitly labeled configured-endpoint scenario. Synthetic tokens are test-only and never accepted by a real backend. No real account sign-in or live backend authorization claim.',
    passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results,
  }
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, `vfopt-ui-001-auth-availability${development ? '-dev' : ''}.json`), JSON.stringify(report, null, 2) + '\n')
  await browser?.close()
  if (server.exitCode === null) {
    const stopped = once(server, 'exit')
    server.kill()
    await stopped
  }
}
if (!results.length || results.some(r => !r.passed)) process.exitCode = 1
console.log(JSON.stringify({ passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }))
