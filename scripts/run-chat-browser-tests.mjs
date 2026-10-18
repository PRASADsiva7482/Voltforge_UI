// Browser/UI contract tests with durable API fixtures; production auth stays unchanged.
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
const root = fileURLToPath(new URL('..', import.meta.url))
const user = { id: 'chat-user', keycloakId: 'chat-user', username: 'engineer', displayName: 'Test Engineer', role: 'USER' }
const server = await createServer({ root, cacheDir: 'node_modules/.cache/chat-tests-vite', server: { host: 'localhost', port: 3124, strictPort: true }, plugins: [{ name: 'chat-test-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop = () => {}; return <AuthContext.Provider value={{user:${JSON.stringify(user)},isAuthenticated:true,isLoading:false,isRedirecting:false,error:null,login:noop,logout:noop,signup:noop,changePassword:noop,configureTotp:noop,manageAccount:noop}}>{children}</AuthContext.Provider> }`
} }] })
const conversations = new Map(), transcripts = new Map(), sends = []
let browser, failNetwork = false, failProvider = false, delay = false
const reply = 'Use a **220 Ω resistor**.\n\n```cpp\nconst int pin = 13; // LED\n```\n\n| Pin | Role |\n| --- | --- |\n| 13 | Output |\n\n[unsafe](javascript:alert(1)) <script>window.chatXss = true</script>'
const paged = (content, page = 0, size = 50) => ({ content: content.slice(page * size, (page + 1) * size), page, size, totalElements: content.length, totalPages: Math.ceil(content.length / size), first: page === 0, last: (page + 1) * size >= content.length })
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    if (path.startsWith('/src/')) return route.continue()
    const ok = data => route.fulfill({ json: { success: true, data } })
    if (path.endsWith('/projects')) return ok(paged([{ id: 'project-1', name: 'Sensor laboratory' }]))
    if (path.endsWith('/projects/project-1')) return ok({ id: 'project-1', owner: user, name: 'Sensor laboratory', boardType: 'ARDUINO_NANO', updatedAt: 'saved-revision', canvasLayout: { nodes: [], wires: [] }, codeFiles: [{ id: 'firmware', filename: 'main.ino', content: 'saved private firmware', language: 'cpp' }] })
    if (path.endsWith('/ai/conversations')) {
      if (method === 'POST') {
        const data = request.postDataJSON(), id = `chat-${conversations.size + 1}`, now = new Date().toISOString()
        const conversation = { id, title: 'New conversation', projectId: data.projectId, createdAt: now, updatedAt: now }
        conversations.set(id, conversation); transcripts.set(id, []); return ok(conversation)
      }
      const q = url.searchParams.get('q') || ''
      const rows = [...conversations.values()].filter(c => c.title.toLowerCase().includes(q.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
      return ok(paged(rows, Number(url.searchParams.get('page')), 30))
    }
    const match = path.match(/\/ai\/conversations\/([^/]+)(.*)$/)
    if (match) {
      const [, id, suffix] = match, conversation = conversations.get(id)
      if (!conversation) return route.fulfill({ status: 404, json: { message: 'Conversation not found' } })
      if (!suffix && method === 'GET') return ok(conversation)
      if (!suffix && method === 'PATCH') { conversation.title = request.postDataJSON().title; return ok(conversation) }
      if (!suffix && method === 'DELETE') { conversations.delete(id); transcripts.delete(id); return ok(null) }
      if (suffix === '/messages') return ok(paged([...transcripts.get(id)].reverse(), Number(url.searchParams.get('page')), 50))
      if (suffix === '/messages/stream') {
        const data = request.postDataJSON(); sends.push(data)
        if (failNetwork) return route.fulfill({ status: 503, json: { message: 'AI service temporarily unavailable' } })
        if (delay) await new Promise(resolve => setTimeout(resolve, 500))
        const messages = transcripts.get(id)
        let first = messages.find(m => m.clientRequestId === data.clientRequestId && m.role === 'user')
        let assistant = messages.find(m => m.clientRequestId === data.clientRequestId && m.role === 'assistant')
        if (!first) {
          first = { id: `${id}-${messages.length + 1}`, conversationId: id, sequenceNumber: messages.length + 1, clientRequestId: data.clientRequestId, role: 'user', content: data.message, status: 'completed' }
          assistant = { ...first, id: `${id}-${messages.length + 2}`, sequenceNumber: messages.length + 2, role: 'assistant' }
          messages.push(first, assistant)
        }
        assistant.content = failProvider ? 'Partial response' : reply; assistant.status = failProvider ? 'failed' : 'completed'
        if (conversation.title === 'New conversation') conversation.title = data.message
        conversation.updatedAt = new Date().toISOString()
        const events = [ { type: 'accepted', data: first }, { type: 'start', mode: 'neural-quality-gated' }, { type: 'token', delta: assistant.content }, { type: 'saved', data: assistant } ]
        return route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') })
      }
      if (suffix === '/stop') { transcripts.get(id).forEach(m => { if (m.status === 'pending') m.status = 'interrupted' }); return ok(null) }
    }
    return route.fulfill({ status: 503, json: { success: false } })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://localhost:3124/ai-chat')
  const input = page.getByRole('textbox', { name: 'Ask VoltForge AI about the current project' })
  const send = page.getByRole('button', { name: 'Send message', exact: true })
  assert(await send.isDisabled()); await input.fill('Explain an LED resistor')
  delay = true; await send.click(); await send.evaluate(button => { button.click(); button.click() })
  await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(sends.length, 1); assert.equal(conversations.size, 1); assert.equal(transcripts.get('chat-1').length, 2)
  assert.equal(sends[0].includeProjectContext, false); assert.equal(sends[0].code, undefined)
  await page.locator('.vf-code-token--keyword').first().waitFor()
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'const int pin = 13; // LED')
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0)
  assert.equal(await page.evaluate(() => window.chatXss), undefined)
  assert.equal(await page.locator('.vf-ai-chat table').count(), 1)
  await page.reload(); await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(conversations.size, 1); assert.equal(await page.locator('.vf-ai-chat__msg').count(), 2)
  console.log('PASS saved messages, reload, request IDs, duplicate prevention, safe Markdown, highlighted code and copy')

  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  await page.getByRole('dialog').waitFor(); await page.getByLabel('Associated project', { exact: true }).selectOption('project-1')
  await page.getByRole('button', { name: 'Create conversation', exact: true }).click()
  await page.getByRole('link', { name: 'Open associated project' }).waitFor()
  assert.equal(conversations.size, 2); assert.equal(transcripts.get('chat-1').length, 2)
  await input.fill('Sensor review'); failNetwork = true; await send.click()
  await page.getByRole('alert').filter({ hasText: 'AI service temporarily unavailable' }).waitFor()
  assert.equal(await input.inputValue(), 'Sensor review'); assert.equal(transcripts.get('chat-2').length, 0)
  const failedId = sends.at(-1).clientRequestId; failNetwork = false; failProvider = true
  await page.getByRole('button', { name: 'Retry send', exact: true }).click()
  await page.getByRole('button', { name: 'Retry response', exact: true }).waitFor()
  assert.equal(sends.at(-1).clientRequestId, failedId)
  failProvider = false; await page.getByRole('button', { name: 'Retry response', exact: true }).click()
  await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(transcripts.get('chat-2').length, 2); assert.equal(sends.at(-1).retry, true)
  console.log('PASS separate new chat, project association, failed-send draft preservation and duplicate-free retry')

  await page.getByRole('button', { name: 'Rename Sensor review', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Sensor design notes')
  await page.getByRole('button', { name: 'Save title', exact: true }).click()
  await page.getByRole('button', { name: 'Rename Sensor design notes', exact: true }).waitFor()
  await page.getByLabel('Search conversations').fill('not-found'); await page.getByText('No matching conversations.').waitFor()
  await page.getByLabel('Search conversations').fill('resistor'); await page.getByRole('button', { name: 'Rename Explain an LED resistor', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Delete Explain an LED resistor', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(conversations.size, 2)
  await page.getByRole('button', { name: 'Delete Explain an LED resistor', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete conversation', exact: true }).click()
  await page.getByText('No matching conversations.').waitFor(); assert.equal(conversations.size, 1)
  await page.getByLabel('Search conversations').fill('')
  console.log('PASS rename, title search, empty results, delete confirmation and transcript cleanup')

  await page.getByRole('checkbox', { name: /Share this project/ }).check()
  await page.getByRole('link', { name: /Sensor laboratory.*Open project/ }).waitFor()
  await input.fill('Review saved firmware'); await send.click()
  await page.getByText('Use a', { exact: false }).last().waitFor()
  assert.equal(sends.at(-1).includeProjectContext, true)
  assert.equal(sends.at(-1).projectId, 'project-1')
  assert.equal(sends.at(-1).boardType, 'ARDUINO_NANO')
  assert.equal(sends.at(-1).code, 'saved private firmware')
  assert.equal(sends.at(-1).projectRevision, 'saved-revision')
  assert.equal(sends.at(-1).simulationState.serialBuffer, undefined, 'Workspace must never borrow another editor run')
  await page.getByRole('checkbox', { name: /Share this project/ }).uncheck()
  await input.fill('General electronics question'); await send.click()
  await page.waitForTimeout(700)
  assert.equal(sends.at(-1).includeProjectContext, false)
  assert.equal(sends.at(-1).code, undefined)
  console.log('PASS saved project context is fetched by association, respects consent and excludes unrelated live execution')

  await mkdir(new URL('../test-results/chat/', import.meta.url), { recursive: true })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async value => { const { useThemeStore } = await import('/src/store/themeStore.ts'); useThemeStore.getState().setTheme(value) }, theme)
    await page.screenshot({ path: `test-results/chat/${theme}-desktop.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Hide conversation history' }).click()
    assert(await input.isVisible()); assert(await send.isVisible())
    const composer = await page.locator('.vf-ai-chat__input-area').boundingBox(), navigation = await page.locator('.app-mobile-nav').boundingBox()
    assert(composer.y + composer.height <= navigation.y, 'Composer stays above mobile navigation')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    await page.screenshot({ path: `test-results/chat/${theme}-mobile.png` })
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByRole('button', { name: 'Conversation history', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('PASS desktop/mobile dark/light layouts and no browser exceptions')
} finally { await browser?.close(); await server.close() }
