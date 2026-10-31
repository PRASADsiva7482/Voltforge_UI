// Opt-in acceptance against real services. No auth transforms, route mocks or fake SSE.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { LiveChatBlocked, runLiveReport, serviceUrl, acceptanceRequest } from './live-chat-report.mjs'
import { OwnedLiveService, portOpen } from './owned-live-service.mjs'
import { verifyProjectDocuments } from './live-project-documents.mjs'
import { verifyCrossUser } from './live-cross-user.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = new Set(process.argv.slice(2))
const aiOutage = args.has('--ai-outage')
const midstreamCrash = args.has('--midstream-crash')
const crossUser = args.has('--cross-user')
const projectDocuments = args.has('--project-documents') || crossUser
const reportPath = resolve(root, `test-results/chat-live/${midstreamCrash ? 'report-midstream' : crossUser ? 'report-cross-user' : projectDocuments ? 'report-project-documents' : aiOutage ? 'report-outage' : 'report'}.json`)
const base = process.env.VF_CHAT_LIVE_URL || 'http://localhost:3000'
const username = process.env.VF_CHAT_LIVE_USERNAME
const password = process.env.VF_CHAT_LIVE_PASSWORD
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let server, browser, ai

let report
try {
report = await runLiveReport(reportPath, async report => {
  if (!args.has('--allow-development-writes')) throw new LiveChatBlocked('DEVELOPMENT_WRITE_OPT_IN_REQUIRED')
  if(midstreamCrash && (aiOutage || projectDocuments)) throw new LiveChatBlocked('SELECT_ONE_FAULT_SCENARIO')
  if (crossUser && (!process.env.VF_CHAT_LIVE_SECOND_USERNAME || !process.env.VF_CHAT_LIVE_SECOND_PASSWORD))
    throw new LiveChatBlocked('SECOND_LOGIN_CREDENTIALS_REQUIRED')
  const app = serviceUrl(base)
  if (aiOutage || projectDocuments || midstreamCrash) {
    if (app !== 'http://localhost:3000' || !process.env.VOLTFORGE_AI_API_TOKEN)
      throw new LiveChatBlocked('AI_OUTAGE_REQUIRES_LOCAL_SERVICE_CONFIGURATION')
    report.stage = 'owned-ai-startup'
    const aiRoot = resolve(root, '../Voltforge_AI')
    const aiEnv = { ...process.env, VOLTFORGE_AI_HOST: '127.0.0.1', VOLTFORGE_AI_PORT: '2002' }
    delete aiEnv.VF_CHAT_LIVE_USERNAME
    delete aiEnv.VF_CHAT_LIVE_PASSWORD
    delete aiEnv.VF_CHAT_LIVE_SECOND_USERNAME
    delete aiEnv.VF_CHAT_LIVE_SECOND_PASSWORD
    // Explicit interpreter, no shell/launcher shim and no credential arguments or transcript logs.
    ai = new OwnedLiveService({ command: resolve(aiRoot, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'),
      args: ['main.py'], cwd: aiRoot, port: 2002,
      env: aiEnv,
      ready: async () => {
        const response = await fetch('http://127.0.0.1:2002/voltForge-ai/api/v1/model/health', {
          headers: { 'X-Voltforge-AI-Token': process.env.VOLTFORGE_AI_API_TOKEN }, signal: AbortSignal.timeout(2000) })
        return response.ok && (await response.json()).ready === true
      },
    })
    await ai.start()
    if (projectDocuments) {
      report.stage='native-embedding-readiness'
      const response=await fetch('http://127.0.0.1:2002/voltForge-ai/api/v1/model/embeddings',{
        headers:{'X-Voltforge-AI-Token':process.env.VOLTFORGE_AI_API_TOKEN},signal:AbortSignal.timeout(5000),
      })
      const metadata=response.ok?await response.json():null
      if(!metadata?.available || metadata.dimensions!==384) throw new LiveChatBlocked('NATIVE_EMBEDDINGS_UNAVAILABLE')
      report.measurements.nativeEmbeddingsReady=true
    }
  }
  try {
  if (args.has('--start-ui')) {
    if (app !== 'http://localhost:3000') throw new LiveChatBlocked('START_UI_REQUIRES_DEFAULT_LOCAL_URL')
    server = await createServer({ root, server: { host: 'localhost', port: 3000, strictPort: true } })
    await server.listen()
  }
  browser = await chromium.launch({ channel: 'chrome', headless: !args.has('--headed') })
  const contexts = []
  const created = new Set()
  let api, issuer, token, context, cleanupSession
  const request = async (path, method = 'GET', session = { context, token }) => {
    assert(api && session.token && session.context)
    return acceptanceRequest(() => session.context.request.fetch(`${api}${path}`, {
      method, headers: { Authorization: `Bearer ${session.token}` }, timeout: 20_000,
    }))
  }
  const messages = async id => {
    assert(created.has(id))
    const response = await request(`/ai/conversations/${encodeURIComponent(id)}/messages`)
    assert.equal(response.status(), 200)
    return (await response.json()).data.content
  }
  const waitFor = async (fn, timeout = 180_000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) { const result = await fn(); if (result) return result; await pause(3000) }
    throw new Error('Acceptance condition not reached')
  }
  const open = async conversationId => {
    context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    contexts.push(context)
    const pageContext = context
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    page.on('request', req => {
      if (!api || !req.url().startsWith(`${api}/`)) return
      const authorization = req.headers().authorization
      if (authorization?.startsWith('Bearer ')) {
        if (context === pageContext) token = authorization.slice(7)
        if (cleanupSession?.context === pageContext) cleanupSession.token = authorization.slice(7)
      }
    })
    page.on('response', response => {
      if (issuer && response.url().startsWith(`${issuer}/protocol/openid-connect/3p-cookies/`)) {
        void response.text().then(body => {
          if (body.includes('ERR_NGROK_6024')) report.identityIframeTunnelWarningObserved = true
        }).catch(() => { /* Navigation can cancel diagnostics; never infer a successful check. */ })
      }
    })
    if (conversationId) assert(created.has(conversationId))
    await page.goto(`${app}/ai-chat${conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ''}`, { waitUntil: 'domcontentloaded' })
    return page
  }
  const login = async (page, credentials = { username, password }) => {
    const { username, password } = credentials
    if (!username || !password) {
      if (!args.has('--headed')) throw new LiveChatBlocked('LIVE_LOGIN_CREDENTIALS_REQUIRED')
      await page.getByLabel('Ask VoltForge AI', { exact: true }).waitFor({ timeout: 180_000 })
      return
    }
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await waitFor(async () => {
      if (await page.getByLabel('Ask VoltForge AI', { exact: true }).isVisible()) return true
      const current = new URL(page.url()), expected = new URL(issuer)
      if (current.origin !== expected.origin || !current.pathname.startsWith(`${expected.pathname}/`)) return false
      if (expected.hostname.endsWith('.ngrok-free.dev')) {
        const visit = page.getByRole('button', { name: 'Visit Site', exact: true })
        if (await visit.isVisible()) {
          report.developmentTunnelWarning = true
          await visit.click()
          return false
        }
      }
      if (await page.locator('#username').isVisible()) {
        // Submit once, only on the configured realm. Existing SSO may skip this form.
        await page.locator('#username').fill(username)
        await page.locator('#password').fill(password)
        await page.locator('#kc-login').click()
        await page.getByLabel('Ask VoltForge AI', { exact: true }).waitFor({ timeout: 60_000 })
        return true
      }
      return false
    }, 90_000)
  }
  try {
    report.stage = 'ui-startup'
    let page = await open()
    report.checks.uiLoaded = true
    const config = await page.evaluate(() => ({ base: window.config?.baseUrls?.BL,
      identity: window.config?.baseUrls?.KEYCLOAK || window.config?.keycloak?.url,
      realm: window.config?.keycloak?.realm }))
    api = serviceUrl(config.base)
    if ((aiOutage || projectDocuments || midstreamCrash) && !['http://localhost:2001/voltForge-app/api/v1', 'http://127.0.0.1:2001/voltForge-app/api/v1'].includes(api))
      throw new LiveChatBlocked('AI_OUTAGE_REQUIRES_LOCAL_BACKEND')
    if (!config.realm || /[/?#]/.test(config.realm)) throw new LiveChatBlocked('INVALID_IDENTITY_CONFIGURATION')
    issuer = `${serviceUrl(config.identity)}/realms/${encodeURIComponent(config.realm)}`
    report.stage = 'identity-discovery'
    try {
      let discovery = await context.request.get(`${issuer}/.well-known/openid-configuration`, { timeout: 10_000 })
      if (new URL(issuer).hostname.endsWith('.ngrok-free.dev') &&
          discovery.headers()['content-type']?.includes('text/html') && (await discovery.text()).includes('ERR_NGROK_6024')) {
        report.developmentTunnelWarning = true
        discovery = await context.request.get(`${issuer}/.well-known/openid-configuration`, {
          timeout: 10_000, headers: { 'ngrok-skip-browser-warning': 'true' },
        })
      }
      if (!discovery.ok() || (await discovery.json()).issuer !== issuer) throw new Error('Unavailable issuer')
      report.checks.issuerDiscovery = true
    } catch { throw new LiveChatBlocked('CONFIGURED_ISSUER_UNAVAILABLE') }
    report.stage = 'first-login'
    await login(page)
    await waitFor(() => token, 10_000)
    report.checks.signedIn = true

    report.stage = 'create-conversation'
    await page.getByRole('button', { name: 'New chat', exact: true }).click()
    await page.getByLabel('Associated project', { exact: true }).selectOption('')
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url() === `${api}/ai/conversations` && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create conversation', exact: true }).click(),
    ])
    assert.equal(response.status(), 201)
    const conversation = (await response.json()).data
    assert.equal(typeof conversation.id, 'string')
    assert(conversation.id.length > 0)
    created.add(conversation.id) // Only a confirmed POST from this run grants cleanup authority.
    cleanupSession = { context, token }
    assert(!conversation.projectId)
    report.checks.createdConversation = true
    const id = conversation.id
    const composer = () => page.getByLabel('Ask VoltForge AI', { exact: true })
    report.stage = 'first-stream'
    await composer().fill('Explain pull-up resistors in three concise paragraphs. This is a synthetic application acceptance test.')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    // A visible, nonempty answer while Stop remains visible establishes pre-terminal rendering.
    await page.waitForFunction(() => Boolean(document.querySelector('.vf-ai-chat__msg--assistant .vf-ai-chat__cursor')) &&
      Boolean(document.querySelector('.vf-ai-chat__msg--assistant .vf-ai-chat__msg-body')?.textContent?.trim()) &&
      Boolean(document.querySelector('button[aria-label="Stop response"]')), undefined, { timeout: 150_000 })
    report.checks.incrementalVisibleAnswer = true
    const completed = await waitFor(async () => {
      const rows = await messages(id)
      if (rows[0]?.status === 'failed' || rows[0]?.status === 'interrupted') throw new Error('Generation did not complete')
      return rows.length === 2 && rows[0].status === 'completed' && rows[0].content.trim() ? rows : false
    })
    report.checks.completedPersisted = true
    report.stage = 'reload'
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitFor(async () => (await composer().isVisible()) ||
      (await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible()), 30_000)
    if (!(await composer().isVisible())) {
      // Do not claim seamless SSO where cross-site iframe policy requires explicit login.
      report.reloadRequiredReauthentication = true
      await login(page)
    } else report.reloadRequiredReauthentication = false
    await composer().waitFor()
    await page.locator('.vf-ai-chat__msg--assistant').waitFor()
    assert.deepEqual((await messages(id)).map(m => [m.id,m.status,m.content]), completed.map(m => [m.id,m.status,m.content]))
    report.checks.reloadRestored = true

    report.stage = 'stop'
    await composer().fill('Explain how a resistor, capacitor and LED differ. Give six numbered paragraphs. This is a synthetic stop and retry test.')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    const stop = page.getByRole('button', { name: 'Stop response', exact: true })
    await stop.waitFor()
    await waitFor(async () => (await messages(id)).length === 4)
    await stop.click()
    const interrupted = await waitFor(async () => {
      const rows = await messages(id)
      return rows[0]?.status === 'interrupted' ? rows : false
    }, 20_000)
    report.checks.stopPersisted = true
    report.stage = 'retry'
    await page.getByRole('button', { name: 'Retry response', exact: true }).click()
    const retried = await waitFor(async () => {
      const rows = await messages(id)
      if (rows[0]?.status === 'failed') throw new Error('Retry failed')
      return rows[0]?.status === 'completed' ? rows : false
    })
    assert.equal(retried.length, 4)
    assert.deepEqual(retried.map(m=>m.id),interrupted.map(m=>m.id))
    report.checks.retrySameMessages = true
    // Fresh cookies/storage and actual login; no injected auth state or JWT decoder.
    token = undefined
    report.stage = 'new-login'
    page = await open(id)
    await login(page)
    await waitFor(()=>token,10_000)
    await composer().waitFor()
    await page.locator('.vf-ai-chat__msg--assistant').first().waitFor()
    assert.deepEqual((await messages(id)).map(m=>[m.id,m.status,m.content]),retried.map(m=>[m.id,m.status,m.content]))
    report.checks.newLoginRestored = true
    report.stage = 'offline-recovery'
    report.networkFault = 'browser-offline'
    await composer().fill('What is a capacitor? Answer in one short sentence. This is a synthetic network recovery test.')
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    const retrySend = page.getByRole('button', { name: 'Retry send', exact: true })
    await retrySend.waitFor()
    await context.setOffline(false)
    assert.deepEqual((await messages(id)).map(m=>m.id),retried.map(m=>m.id))
    report.checks.offlineNoWrite = true
    await retrySend.click()
    const recovered = await waitFor(async () => {
      const rows = await messages(id)
      if (rows[0]?.status === 'failed') throw new Error('Network retry failed')
      return rows.length === 6 && rows[0].status === 'completed' ? rows : false
    })
    assert.equal(new Set(recovered.map(m=>m.id)).size,6)
    assert.equal(recovered.filter(m=>m.role==='user').length,3)
    report.checks.offlineRetryRestored = true
    report.measurements.persistedMessages = recovered.length
    if (aiOutage) {
      report.stage = 'ai-process-outage'
      await ai.stop()
      assert.equal(await portOpen(2002), false)
      report.checks.aiProcessStopped = true
      await composer().fill('What is a diode? Answer in one short sentence. This is a synthetic AI outage recovery test.')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      const failed = await waitFor(async () => {
        const rows = await messages(id)
        return rows.length === 8 && rows[0].status === 'failed' ? rows : false
      }, 45_000)
      assert.equal(failed[0].role, 'assistant')
      assert.equal(failed[1].role, 'user')
      assert.equal(failed[1].status, 'completed')
      assert.deepEqual(failed.slice(2).map(m=>[m.id,m.status,m.content]), recovered.map(m=>[m.id,m.status,m.content]))
      report.checks.outageFailedPersisted = true
      await page.getByRole('button', { name: 'Retry response', exact: true }).waitFor()
      const failureStatus = page.locator('.vf-ai-chat__msg--assistant').last().getByRole('status')
      await failureStatus.waitFor()
      assert((await failureStatus.innerText()).trim().length > 0)
      assert.equal(await page.getByRole('button', { name: 'Stop response', exact: true }).isVisible(), false)
      report.checks.outageFailureVisible = true
      report.stage = 'ai-process-restart'
      await ai.start()
      report.checks.aiProcessRestarted = true
      await page.getByRole('button', { name: 'Retry response', exact: true }).click()
      const restored = await waitFor(async () => {
        const rows = await messages(id)
        return rows[0]?.status === 'completed' && rows[0].content.trim() ? rows : false
      })
      assert.deepEqual(restored.map(m=>m.id), failed.map(m=>m.id))
      assert.deepEqual(restored.slice(2).map(m=>[m.id,m.status,m.content]), recovered.map(m=>[m.id,m.status,m.content]))
      assert.equal(restored.filter(m=>m.role==='user').length,4)
      report.checks.outageRetrySameMessages = true
      report.measurements.persistedMessages = restored.length
    }
    if (midstreamCrash) {
      report.stage='midstream-partial-output'
      await composer().fill('Explain resistor, capacitor and transistor behavior in six detailed paragraphs. This is a synthetic interrupted-generation acceptance test.')
      await page.getByRole('button',{name:'Send message',exact:true}).click()
      const pending=await waitFor(async()=>{
        const rows=await messages(id)
        if(rows.length===8 && rows[0].status!=='pending') throw new Error('Generation finished before crash injection')
        return rows.length===8 && rows[0].status==='pending' && rows[0].content.trim().length>8 ? rows : false
      })
      await page.locator('.vf-ai-chat__msg--assistant').last().locator('.vf-ai-chat__cursor').waitFor()
      assert.equal(await page.getByRole('button',{name:'Stop response',exact:true}).isVisible(),true)
      report.checks.partialPersistedBeforeCrash=true
      report.measurements.preCrashCharacters=pending[0].content.length
      report.stage='midstream-force-kill'
      const killedAt=Date.now()
      await ai.stop({force:true})
      assert.equal(await portOpen(2002),false)
      report.checks.aiKilledDuringGeneration=true
      const failed=await waitFor(async()=>{
        const rows=await messages(id)
        if(rows[0]?.status==='completed') throw new Error('Completed response cannot establish interruption')
        return ['failed','interrupted'].includes(rows[0]?.status) ? rows : false
      },45_000)
      assert.equal(failed.length,8)
      assert(failed[0].content.startsWith(pending[0].content),'persisted partial prefix must survive the crash')
      assert(failed[0].metadata?.errorCode)
      const snapshot=rows=>rows.map(m=>[m.id,m.role,m.status,m.content])
      assert.deepEqual(snapshot(failed.slice(2)),snapshot(recovered))
      report.checks.partialFailurePersisted=true
      report.measurements.crashTerminalMilliseconds=Date.now()-killedAt
      report.measurements.partialCharacters=failed[0].content.length
      report.measurements.partialTerminalStatus=failed[0].status
      await page.getByRole('button',{name:'Retry response',exact:true}).waitFor()
      const partial=page.locator('.vf-ai-chat__msg--assistant').last()
      // Markdown markers are intentionally absent from rendered text. Exact
      // raw-prefix integrity is asserted against persisted messages above.
      assert((await partial.locator('.vf-ai-chat__markdown-block').allTextContents()).join('').trim().length>8)
      await partial.getByRole('status').waitFor()
      assert.equal(await page.getByRole('button',{name:'Stop response',exact:true}).isVisible(),false)
      report.checks.partialFailureVisible=true
      report.stage='midstream-reload'
      await page.reload({waitUntil:'domcontentloaded'})
      await waitFor(async()=>await composer().isVisible() || await page.getByRole('button',{name:'Sign in',exact:true}).isVisible(),30_000)
      if(!(await composer().isVisible())) await login(page)
      await page.getByRole('button',{name:'Retry response',exact:true}).waitFor()
      assert.deepEqual(snapshot(await messages(id)),snapshot(failed))
      report.checks.partialReloadRestored=true
      await ai.start()
      report.checks.midstreamAiRestarted=true
      report.stage='midstream-retry'
      const [retryAccepted]=await Promise.all([
        page.waitForResponse(r=>r.url()===`${api}/ai/conversations/${id}/messages/stream` && r.request().method()==='POST',{timeout:150_000}),
        page.getByRole('button',{name:'Retry response',exact:true}).click(),
      ])
      assert.equal(retryAccepted.status(),200,'wait for the new attempt before inspecting terminal status')
      const restored=await waitFor(async()=>{
        const rows=await messages(id)
        if(rows[0]?.status==='failed') throw new Error('Crash retry failed')
        return rows[0]?.status==='completed' && rows[0].content.trim() ? rows : false
      })
      assert.deepEqual(restored.map(m=>m.id),failed.map(m=>m.id))
      assert.deepEqual(snapshot(restored.slice(2)),snapshot(recovered))
      assert.equal(restored.filter(m=>m.role==='user').length,4)
      assert(!restored[0].metadata?.errorCode)
      report.checks.midstreamRetrySameMessages=true
      report.measurements.persistedMessages=restored.length
    }
    if (projectDocuments) {
      await verifyProjectDocuments({ page, api, waitFor, login, report,
        verifyOtherUser: crossUser ? fixture => verifyCrossUser({ browser, app, api, login, waitFor, report,
          ownerToken: token, fixture,
          credentials: { username: process.env.VF_CHAT_LIVE_SECOND_USERNAME, password: process.env.VF_CHAT_LIVE_SECOND_PASSWORD },
        }) : undefined,
        call: (path, options={}) => acceptanceRequest(() => context.request.fetch(`${api}${path}`, {
          ...options, headers: { Authorization: `Bearer ${token}` }, timeout: 30_000,
        })),
      })
    }
  } finally {
    let cleaned = true
    for (const id of created) {
      try {
        // All contexts created by open() authenticate the same owner. Prefer
        // their latest token after reload instead of an expired initial login.
        const session = token && context ? { context, token } : cleanupSession
        await request(`/ai/conversations/${encodeURIComponent(id)}/stop`, 'POST', session)
        const deletion = await request(`/ai/conversations/${encodeURIComponent(id)}`, 'DELETE', session)
        const absent = await request(`/ai/conversations/${encodeURIComponent(id)}`, 'GET', session)
        if (!deletion.ok() || absent.status() !== 404) cleaned = false
      } catch { cleaned = false }
    }
    report.checks.cleanup = cleaned
    report.measurements.createdConversations = created.size
    report.measurements.cleanupIncomplete = !cleaned
    for (const item of contexts) await item.close()
  }
  } finally {
    if (ai) { await ai.stop(); report.checks.ownedAiStopped = true }
  }
}, { aiOutage, projectDocuments, crossUser, midstreamCrash })
} finally {
  try { await ai?.stop() }
  finally {
    try { await browser?.close() }
    finally { await server?.close() }
  }
}
console.log(JSON.stringify(report))
process.exitCode = report.status === 'passed' ? 0 : 1
