// Browser/UI contract tests with durable API fixtures; production auth stays unchanged.
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
const root = fileURLToPath(new URL('..', import.meta.url))
const user = { id: 'chat-user', keycloakId: 'chat-user', username: 'engineer', displayName: 'Test Engineer', role: 'USER' }
let liveStream
const server = await createServer({ root, cacheDir: 'node_modules/.cache/chat-tests-vite', server: { host: 'localhost', port: 3124, strictPort: true }, plugins: [{ name: 'chat-test-auth', enforce: 'pre', configureServer(vite) {
  vite.middlewares.use('/__chat-stream', (request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const data = JSON.parse(body)
      const messages = transcripts.get('live-chat')
      const first = { id: `live-${messages.length + 1}`, conversationId: 'live-chat', clientRequestId: data.clientRequestId, sequenceNumber: messages.length + 1, role: 'user', content: data.message, status: 'completed' }
      const assistant = { ...first, id: `live-${messages.length + 2}`, sequenceNumber: messages.length + 2, role: 'assistant', content: '', status: 'pending' }
      messages.push(first, assistant)
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' })
      response.flushHeaders()
      const write = event => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      write({ type: 'accepted', data: first }); write({ type: 'start', mode: 'neural' })
      liveStream = {
        token(delta) { assistant.content += delta; write({ type: 'token', delta }) },
        finish() { assistant.status = 'completed'; write({ type: 'complete', reply: assistant.content }); write({ type: 'saved', data: assistant }); response.end() },
        close() { response.end() },
      }
    })
  })
}, transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop = () => {}; return <AuthContext.Provider value={{user:${JSON.stringify(user)},isAuthenticated:true,isLoading:false,isRedirecting:false,error:null,login:noop,logout:noop,signup:noop,changePassword:noop,configureTotp:noop,manageAccount:noop}}>{children}</AuthContext.Provider> }`
} }] })
const conversations = new Map(), transcripts = new Map(), sends = []
const referenceId = '11111111-1111-4111-8111-111111111111', versionId = '22222222-2222-4222-8222-222222222222', chunkId = '33333333-3333-4333-8333-333333333333'
const documentRows = new Map()
let browser, failNetwork = false, failProvider = false, delay = false, failMemory = false, providerErrorCode, failResearch = true, researchAvailable = false
const preferences = {}
const reply = 'Use a **220 Ω resistor**.\n\n```cpp\nconst int pin = 13; // LED\n```\n\n| Pin | Role |\n| --- | --- |\n| 13 | Output |\n\n[unsafe](javascript:alert(1)) <script>window.chatXss = true</script>'
const paged = (content, page = 0, size = 50) => ({ content: content.slice(page * size, (page + 1) * size), page, size, totalElements: content.length, totalPages: Math.ceil(content.length / size), first: page === 0, last: (page + 1) * size >= content.length })
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    if (path.startsWith('/src/')) return route.continue()
    const ok = data => route.fulfill({ json: { success: true, data } })
    if (path.endsWith('/ai/documents')) {
      if (method === 'POST') {
        assert(request.headers()['content-type'].startsWith('multipart/form-data; boundary='), 'Upload must retain the browser multipart boundary')
        const previous = documentRows.get(referenceId)
        const doc = { id: referenceId, title: 'ZX123 reference', currentVersion: (previous?.currentVersion || 0) + 1 }
        documentRows.set(referenceId, doc); return ok(doc)
      }
      return ok(paged([...documentRows.values()].filter(d => d.title.includes(url.searchParams.get('q') || '')), Number(url.searchParams.get('page')), 20))
    }
    if (path.includes('/ai/documents/')) {
      if (method === 'DELETE') { documentRows.delete(referenceId); return ok(null) }
      if (!documentRows.has(referenceId)) return route.fulfill({ status: 404, json: { message: 'Source not found' } })
      return ok({ title: 'ZX123 reference', version: 1, page: 1, content: 'ZX123 supply voltage 3.3 V. <script>never execute</script>' })
    }
    if (path.endsWith('/ai/research/capabilities')) {
      if (failResearch) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
      if (researchAvailable) return ok({ web: { state: 'available', available: true, supportedModes: ['off', 'on'], message: 'Web search configured.' }, documents: { available: false, message: 'Document retrieval is not available yet.' } })
      return ok({ contractVersion: '1.0', web: { state: 'unavailable', available: false, configured: false, code: 'AI_WEB_NOT_IMPLEMENTED', supportedModes: ['off'], message: 'Web search is not available yet. Ordinary chat uses the local model.' }, documents: { state: 'unavailable', available: false, configured: false, code: 'AI_DOCUMENTS_NOT_IMPLEMENTED', message: 'Document retrieval is not available yet.' } })
    }
    const memoryMatch = path.match(/\/ai\/user-memory(?:\/([^/]+))?$/)
    if (memoryMatch) {
      if (failMemory) return route.fulfill({ status: 503, json: { message: 'Memory unavailable' } })
      if (method === 'PUT') preferences[memoryMatch[1]] = request.postDataJSON().value
      if (method === 'DELETE') delete preferences[memoryMatch[1]]
      return ok(preferences)
    }
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
        if (id === 'live-chat') return route.continue({ url: 'http://localhost:3124/__chat-stream' })
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
        assistant.content = failProvider ? (providerErrorCode ? '' : 'Partial response') : reply; assistant.status = failProvider ? 'failed' : 'completed'
        first.metadata = { research: data.research }
        assistant.metadata = failProvider ? { errorCode: providerErrorCode || 'AI_GENERATION_INTERRUPTED' } : data.research?.mode === 'on' ? { citations: [
          { citationId: 'S1', title: 'Arduino documentation', url: 'https://docs.arduino.cc/hardware/uno-rev3/', locator: 'web_page' },
          { citationId: 'S2', title: 'Unsafe fixture', url: 'javascript:alert(1)' },
        ] } : data.research?.documentIds?.length ? { citations: [
          { citationId: 'S1', title: 'ZX123 reference · v1', locator: 'document_chunk', documentId: referenceId, versionId, sourceId: chunkId, page: 1 },
        ] } : {}
        if (conversation.title === 'New conversation') conversation.title = data.message
        conversation.updatedAt = new Date().toISOString()
        const events = [ { type: 'accepted', data: first }, { type: 'start', mode: failProvider && providerErrorCode ? 'unavailable' : 'neural-quality-gated' },
          ...(failProvider && providerErrorCode ? [{ type: 'error', code: providerErrorCode }] : [{ type: 'token', delta: assistant.content }]), { type: 'saved', data: assistant } ]
        return route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') })
      }
      if (suffix === '/stop') { transcripts.get(id).forEach(m => { if (m.status === 'pending') m.status = 'interrupted' }); return ok(null) }
    }
    return route.fulfill({ status: 503, json: { success: false } })
  })
  const page = await context.newPage(), errors = []
  await page.addInitScript(() => {
    window.chatLayoutErrors = []
    window.addEventListener('error', event => { window.chatLayoutErrors.push(event.message) })
  })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://localhost:3124/ai-chat')
  const input = page.getByRole('textbox', { name: 'Ask VoltForge AI', exact: true })
  const send = page.getByRole('button', { name: 'Send message', exact: true })
  await page.getByRole('heading', { name: 'AI Workspace', exact: true }).waitFor()
  assert.equal(await page.locator('.vf-ai-chat__brand-sub, .vf-ai-chat__msg-avatar').count(), 0)
  assert.equal(await page.getByText('General chat · No project linked', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Preference memory', exact: true }).count(), 0, 'Memory is tucked away until options open')
  assert.equal(await page.locator('.vf-ai-chat__header .vf-ai-chat__brand-icon').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Conversation history', exact: true }).count(), 0, 'Expanded history has one collapse control, no duplicate toggle')
  assert.equal(await page.getByText('Private to your account · Saved on VoltForge', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('checkbox', { name: /Share this project/ }).count(), 0)
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByText('Web and documents', { exact: true }).click()
  await page.getByText('Research availability could not be checked.', { exact: false }).waitFor()
  failResearch = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await page.getByText('Web search is not available yet.', { exact: false }).waitFor()
  assert(await page.getByText('Project sharing does not authorize external searches.', { exact: false }).isVisible())
  assert.equal(await page.getByRole('checkbox', { name: /Web search/ }).count(), 0)
  await page.getByText('Web and documents', { exact: true }).click()
  console.log('PASS research availability errors recover; unsupported research is honest and separate from project consent')
  await page.getByRole('button', { name: 'Preference memory', exact: true }).click()
  const memoryDialog = page.getByRole('dialog')
  await memoryDialog.getByLabel('Response detail', { exact: true }).selectOption('concise')
  failMemory = true
  await memoryDialog.locator('.vf-memory-row').filter({ hasText: 'Response detail' }).getByRole('button', { name: 'Save', exact: true }).click()
  await memoryDialog.getByRole('alert').waitFor()
  assert.equal(preferences.response_detail, undefined)
  assert.equal(await memoryDialog.getByLabel('Response detail', { exact: true }).inputValue(), 'concise')
  failMemory = false
  await memoryDialog.locator('.vf-memory-row').filter({ hasText: 'Response detail' }).getByRole('button', { name: 'Save', exact: true }).click()
  await memoryDialog.getByText('Preference saved.', { exact: false }).waitFor()
  assert.equal(preferences.response_detail, 'concise')
  await page.keyboard.press('Escape')
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByRole('button', { name: 'Preference memory', exact: true }).click()
  assert.equal(await memoryDialog.getByLabel('Response detail', { exact: true }).inputValue(), 'concise')
  await memoryDialog.getByLabel('Response detail', { exact: true }).selectOption('detailed')
  await memoryDialog.locator('.vf-memory-row').filter({ hasText: 'Response detail' }).getByRole('button', { name: 'Save', exact: true }).click()
  await memoryDialog.getByText('Preference saved.', { exact: false }).waitFor()
  assert.equal(preferences.response_detail, 'detailed')
  await memoryDialog.getByRole('button', { name: 'Forget Response detail', exact: true }).click()
  await memoryDialog.getByText('Preference deleted', { exact: false }).waitFor()
  assert.equal(preferences.response_detail, undefined)
  await page.keyboard.press('Escape')
  console.log('PASS general chat has no project control; memory review, edit, deletion and storage-failure recovery')
  assert(await send.isDisabled()); await input.fill('Explain an LED resistor')
  delay = true; await send.click(); await input.press('Enter'); await input.press('Enter')
  await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(sends.length, 1); assert.equal(conversations.size, 1); assert.equal(transcripts.get('chat-1').length, 2)
  assert.equal(sends[0].includeProjectContext, false); assert.equal(sends[0].code, undefined)
  await page.locator('.vf-code-token--keyword').first().waitFor()
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'const int pin = 13; // LED')
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0)
  assert.equal(await page.evaluate(() => window.chatXss), undefined)
  assert.equal(await page.locator('.vf-ai-chat table').count(), 1)
  assert.equal(await page.locator('.vf-chat-message-actions .vf-chat-copy').count(), 2, 'Exactly one complete-message copy action per completed message')
  assert.equal(await page.locator('.vf-ai-chat__msg--user .vf-ai-chat__msg-avatar').count(), 0)
  assert.equal(await page.locator('.vf-ai-chat__msg--assistant .vf-ai-chat__msg-avatar').count(), 0)
  const messageCopy = page.getByRole('button', { name: 'Copy assistant message', exact: true })
  await input.focus(); await page.locator('.vf-ai-chat__header').hover()
  assert.equal(await messageCopy.evaluate(el => getComputedStyle(el).opacity), '0', 'Copy stays out of the default reading view')
  await page.locator('.vf-ai-chat__msg--assistant').hover()
  assert.equal(await messageCopy.evaluate(el => getComputedStyle(el).opacity), '1')
  await page.locator('.vf-ai-chat__header').hover(); await messageCopy.focus()
  assert.equal(await messageCopy.evaluate(el => getComputedStyle(el).opacity), '1', 'Keyboard focus exposes Copy')
  await messageCopy.click()
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), reply, 'Copy includes all Markdown, code, and tables (Windows clipboard normalizes line endings)')
  await messageCopy.getByText('Copied', { exact: true }).waitFor()
  await messageCopy.getByText('Copy', { exact: true }).waitFor()
  await page.evaluate(() => { window.originalClipboardWrite = navigator.clipboard.writeText; navigator.clipboard.writeText = async () => { throw new Error('Denied by browser') } })
  await messageCopy.click()
  await page.getByText('Clipboard unavailable. Select the message text to copy it.', { exact: true }).waitFor()
  await page.evaluate(() => { navigator.clipboard.writeText = window.originalClipboardWrite; delete window.originalClipboardWrite })
  await messageCopy.click(); await messageCopy.getByText('Copied', { exact: true }).waitFor()
  assert.equal(await page.getByText('Clipboard unavailable. Select the message text to copy it.', { exact: true }).count(), 0)
  await page.reload(); await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(conversations.size, 1); assert.equal(await page.locator('.vf-ai-chat__msg').count(), 2)
  console.log('PASS saved messages, reload, request IDs, duplicate prevention, safe Markdown, highlighted code and copy')
  assert.equal(await page.locator('.vf-ai-chat__sources, .vf-ai-chat__confidence, .vf-ai-chat__thinking, .vf-ai-chat__citations, .vf-ai-chat__grounding, .vf-ai-chat__uncertainty').count(), 0, 'Chat shows messages without model metadata above or below them')

  await page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/projectStore.ts')
    useProjectStore.setState({ currentProject: { id: 'unrelated-editor-project', name: 'Unrelated private project', codeFiles: [], boardType: 'ESP32' } })
  })
  await input.fill('Continue general chat'); await send.click(); await page.waitForTimeout(700)
  assert.equal(sends.at(-1).projectId, undefined)
  assert.equal(sends.at(-1).includeProjectContext, false)
  assert.equal(conversations.get('chat-1').projectId, undefined)
  assert.equal(await page.locator('.vf-chat-project').count(), 0)
  await page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/projectStore.ts'); useProjectStore.setState({ currentProject: undefined })
  })
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 4, 'Editor navigation cannot reset a standalone conversation')

  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  await page.getByRole('dialog').waitFor(); await page.getByLabel('Associated project', { exact: true }).selectOption('project-1')
  await page.getByRole('button', { name: 'Create conversation', exact: true }).click()
  await page.getByRole('link', { name: 'Open associated project' }).waitFor()
  assert.equal(conversations.size, 2); assert.equal(transcripts.get('chat-1').length, 4)
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
    await page.getByRole('button', { name: 'Conversation history', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Conversation history', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Conversation history', exact: true })
    await drawer.waitFor()
    assert.equal(await page.locator('.vf-ai-chat').getAttribute('inert'), '')
    await page.keyboard.press('Shift+Tab')
    assert(await drawer.evaluate(el => el.contains(document.activeElement)), 'Drawer retains keyboard focus')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Conversation history', exact: true }).waitFor()
    assert(await page.getByRole('button', { name: 'Conversation history', exact: true }).evaluate(el => el === document.activeElement))
    assert(await input.isVisible()); assert(await send.isVisible())
    const composer = await page.locator('.vf-ai-chat__input-area').boundingBox(), navigation = await page.locator('.app-mobile-nav').boundingBox()
    assert(composer.y + composer.height <= navigation.y, 'Composer stays above mobile navigation')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    await page.screenshot({ path: `test-results/chat/${theme}-mobile.png` })
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByRole('button', { name: 'Conversation history', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('PASS desktop/mobile dark/light layouts and no browser exceptions')

  const layoutTime = new Date().toISOString()
  const longTitle = 'Firmware and wiring review for the environmental monitoring station with a very long conversation title'
  conversations.set('layout-chat', { id: 'layout-chat', title: longTitle, createdAt: layoutTime, updatedAt: layoutTime })
  transcripts.set('layout-chat', [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello! How can I help with your electronics project?' },
    { role: 'user', content: 'Help me review a sensor circuit.\nWhat information should I share?' },
    { role: 'assistant', content: 'Start with the **board model**, the sensor part number, and your wiring.\n\n- Include the power supply voltage.\n- Share the relevant firmware or compiler error.\n\nEnable project sharing when you want me to use the linked project’s context.' },
  ].map((message, i) => ({ ...message, id: `layout-${i}`, conversationId: 'layout-chat', sequenceNumber: i + 1, clientRequestId: `layout-${i}`, status: 'completed' })))
  await page.goto('http://localhost:3124/ai-chat?conversation=layout-chat')
  await page.getByText('Hello! How can I help with your electronics project?', { exact: true }).waitFor()
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async value => { const { useThemeStore } = await import('/src/store/themeStore.ts'); useThemeStore.getState().setTheme(value) }, theme)
    for (const [width, height] of [[1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(100)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      const box = await page.locator('.vf-ai-chat__input-row').boundingBox()
      assert(box.width > 200 && box.x >= 0 && box.x + box.width <= width + 1)
      const title = page.locator('.vf-ai-chat__brand-name')
      assert(await title.evaluate(el => getComputedStyle(el).textOverflow === 'ellipsis' && el.getBoundingClientRect().right <= el.closest('header').getBoundingClientRect().right), 'Long header title stays within the header and supports ellipsis')
      for (const message of await page.locator('.vf-ai-chat__msg').all()) assert.equal(await message.locator('.vf-chat-copy').count(), 1)
      assert.equal(await page.locator('.vf-ai-chat__msg-avatar').count(), 0, 'No avatars before any response')
      await page.screenshot({ path: `test-results/chat/cleanup-${theme}-${width}.png` })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByText('Context and privacy', { exact: true }).click()
  await page.getByText('This is a general chat with no linked project.', { exact: false }).waitFor()
  const optionsBox = await page.locator('.vf-chat-options__panel').boundingBox()
  assert(optionsBox.x >= 0 && optionsBox.x + optionsBox.width <= 390)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.vf-chat-options').getAttribute('open'), null)
  const singleLineHeight = (await input.boundingBox()).height
  await input.fill(Array.from({ length: 24 }, (_, i) => `Firmware note ${i + 1}`).join('\n'))
  await page.waitForTimeout(100)
  const multilineHeight = (await input.boundingBox()).height
  assert(multilineHeight > singleLineHeight && multilineHeight <= 161, 'Composer grows within a bounded height')
  assert(await input.evaluate(el => el.scrollHeight > el.clientHeight), 'Long draft scrolls inside the composer')
  await input.fill('First line'); await input.press('Shift+Enter'); await input.press('S')
  assert.equal(await input.inputValue(), 'First line\nS')
  const beforeViewportSends = sends.length
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 400 })
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(100)
  const compressed = await page.locator('.vf-ai-chat__input-row').boundingBox()
  assert(compressed.y + compressed.height < 400, 'Composer fits above the mobile keyboard viewport')
  assert.equal(sends.length, beforeViewportSends, 'Multiline input and resizing cannot submit a draft')
  await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')) })
  await input.fill('')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click()
  assert.deepEqual(errors, [])
  console.log('PASS quiet message actions, no avatars, options/privacy access, long titles, five viewport widths, composer growth and keyboard viewport')
  assert.deepEqual(await page.evaluate(() => window.chatLayoutErrors), [], 'No layout observer or window errors')

  // Returning to the window or loading older pages must preserve the reading position.
  const now = new Date().toISOString()
  conversations.set('scroll-chat', { id: 'scroll-chat', title: 'Long conversation', createdAt: now, updatedAt: now })
  transcripts.set('scroll-chat', Array.from({ length: 60 }, (_, index) => ({ id: `scroll-${index}`, conversationId: 'scroll-chat', clientRequestId: `scroll-request-${index}`, sequenceNumber: index + 1, role: index % 2 ? 'assistant' : 'user', content: `Saved message ${index + 1}: a useful electronics explanation.`, status: 'completed' })))
  await page.goto('http://localhost:3124/ai-chat?conversation=scroll-chat')
  await page.getByRole('button', { name: 'Load older messages', exact: true }).waitFor()
  const viewport = page.locator('.vf-ai-chat__messages')
  await viewport.evaluate(el => { el.scrollTop = 0 })
  await page.getByRole('button', { name: 'Load older messages', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.vf-ai-chat__msg').length === 60)
  await viewport.evaluate(el => { el.scrollTop = 300 })
  await page.waitForTimeout(100)
  const beforeFocus = await viewport.evaluate(el => el.scrollTop)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(700)
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 60)
  assert(Math.abs(await viewport.evaluate(el => el.scrollTop) - beforeFocus) < 4, 'Focus refresh preserves older history and scroll')
  await input.fill('Continue while reading older messages'); await send.click()
  await page.waitForTimeout(800)
  assert(Math.abs(await viewport.evaluate(el => el.scrollTop) - beforeFocus) < 4, 'Incoming response must not force scroll to bottom')
  assert.deepEqual(errors, [])
  console.log('PASS older-message pagination, focus refresh and incoming responses preserve the reading position')

  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  await page.getByRole('button', { name: 'Create conversation', exact: true }).click()
  failProvider = true; providerErrorCode = 'AI_MODEL_UNAVAILABLE'; delay = false
  await input.fill('Unavailable model regression'); await send.click()
  await page.getByText('The AI model could not load.', { exact: false }).waitFor()
  assert.equal(await page.getByText('Response incomplete', { exact: true }).count(), 0)
  const retryId = sends.at(-1).clientRequestId
  const affected = [...transcripts.values()].find(messages => messages.some(m => m.clientRequestId === retryId))
  assert.equal(affected.length, 2)
  await page.reload()
  await page.getByText('The AI model could not load.', { exact: false }).waitFor()
  assert.equal(await page.getByText('Response incomplete', { exact: true }).count(), 0)
  failProvider = false; providerErrorCode = undefined
  await page.getByRole('button', { name: 'Retry response', exact: true }).click()
  await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(affected.length, 2)
  assert.equal(sends.at(-1).clientRequestId, retryId)
  assert.equal(affected.at(-1).status, 'completed')
  await page.reload(); await page.getByText('Use a', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Retry response', exact: true }).count(), 0)
  assert.equal(await page.locator('.vf-ai-chat__message-status').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS actual model-unavailable error survives saved event and reload; recovery retries the same message and clears failure')

  conversations.set('live-chat', { id: 'live-chat', title: 'Live streaming test', createdAt: now, updatedAt: now })
  transcripts.set('live-chat', [])
  await page.goto('http://localhost:3124/ai-chat?conversation=live-chat')
  await input.fill('Streaming probe'); await send.click()
  await page.getByRole('button', { name: 'Stop response', exact: true }).waitFor()
  for (let attempt = 0; !liveStream && attempt < 100; attempt++) await page.waitForTimeout(50)
  assert(liveStream, 'Real HTTP stream connected')
  await page.getByRole('status', { name: 'Generating response', exact: true }).waitFor()
  assert.equal(await page.locator('.vf-ai-chat__msg-avatar').count(), 0, 'No AI icon before streamed text')
  assert.equal(await page.locator('.vf-ai-chat__msg--assistant').count(), 1, 'One assistant bubble while waiting for first token')
  liveStream.token('Progressive text')
  const liveMessage = page.locator('.vf-ai-chat__msg--assistant').last()
  await liveMessage.getByText('Progressive text', { exact: true }).waitFor()
  assert.equal(await page.getByRole('status', { name: 'Generating response', exact: true }).count(), 0)
  assert.equal(transcripts.get('live-chat')[1].status, 'pending', 'Text renders before completion or saved event')
  assert.equal(await send.count(), 0, 'Stop replaces Send during generation')
  liveStream.token(' arrives before completion.')
  await liveMessage.getByText('Progressive text arrives before completion.', { exact: true }).waitFor()
  assert.equal(transcripts.get('live-chat')[1].status, 'pending')
  liveStream.finish()
  await page.getByRole('button', { name: 'Copy assistant message', exact: true }).waitFor()
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 2)
  await page.reload()
  await page.getByText('Progressive text arrives before completion.', { exact: true }).waitFor()
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 2)
  assert.deepEqual(errors, [])
  console.log('PASS real HTTP chunks paint incrementally before completion, reconcile once and survive reload')
  liveStream = undefined
  await input.fill('Stop this streaming probe'); await send.click()
  await page.getByRole('status', { name: 'Generating response', exact: true }).waitFor()
  assert(liveStream)
  liveStream.token('Partial output before stop')
  await page.getByText('Partial output before stop', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Stop response', exact: true }).click()
  await page.getByRole('button', { name: 'Retry response', exact: true }).waitFor()
  assert.equal(transcripts.get('live-chat').at(-1).status, 'interrupted')
  await page.reload()
  await page.getByText('Partial output before stop', { exact: true }).waitFor()
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 4)
  assert.deepEqual(errors, [])
  console.log('PASS stop during real streaming preserves partial text and restores an interrupted response')

  researchAvailable = true
  conversations.set('research-chat', { id: 'research-chat', title: 'Research consent test', createdAt: now, updatedAt: now })
  transcripts.set('research-chat', [])
  await page.goto('http://localhost:3124/ai-chat?conversation=research-chat')
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByText('Web and documents', { exact: true }).click()
  await page.getByText('Web search configured.', { exact: true }).waitFor()
  await page.getByLabel('Web research', { exact: true }).selectOption('on')
  await input.fill('Compare the official Uno specifications')
  const beforeResearch = sends.length
  await send.click()
  assert.equal(sends.length, beforeResearch, 'Unreviewed search must not submit')
  const publicQuery = page.getByLabel('Public search query', { exact: true })
  const approval = page.getByRole('checkbox', { name: 'Send this public query to the search provider', exact: true })
  await publicQuery.fill('Arduino Uno official specifications')
  await approval.check()
  await publicQuery.fill('Arduino Uno R3 official specifications')
  assert.equal(await approval.isChecked(), false, 'Editing a query revokes consent')
  await approval.check()
  await send.click()
  await page.getByText('Sources (1)', { exact: true }).waitFor()
  assert.equal(sends.length, beforeResearch + 1)
  assert.equal(sends.at(-1).research.publicQuery, 'Arduino Uno R3 official specifications')
  assert.equal(sends.at(-1).research.consentToExternalQuery, true)
  assert.equal(sends.at(-1).includeProjectContext, false)
  assert.equal(sends.at(-1).code, undefined)
  assert.equal(await page.locator('.vf-research-options input[type="checkbox"]').isChecked(), false, 'Consent is consumed by the accepted turn')
  await page.getByText('Sources (1)', { exact: true }).click()
  await page.getByRole('link', { name: '[S1] Arduino documentation', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: /Unsafe fixture/ }).count(), 0)
  await page.reload()
  await page.getByText('Sources (1)', { exact: true }).waitFor()
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByText('Web and documents', { exact: true }).click()
  assert.equal(await page.getByLabel('Web research', { exact: true }).inputValue(), 'on')
  assert.equal(await publicQuery.inputValue(), '')
  assert.equal(await approval.isChecked(), false, 'Reload preserves mode, never query consent')
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 2)
  assert.deepEqual(errors, [])
  console.log('PASS reviewed public query, consent reset, safe source links, citation restoration and mode persistence')

  await page.getByLabel('Web research', { exact: true }).selectOption('off')
  conversations.set('document-chat', { id: 'document-chat', title: 'Document test', createdAt: now, updatedAt: now }); transcripts.set('document-chat', [])
  await page.goto('http://localhost:3124/ai-chat?conversation=document-chat')
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByRole('button', { name: 'Reference documents', exact: true }).click()
  const library = page.getByRole('dialog', { name: 'Reference documents', exact: true })
  await library.getByText('No matching documents.', { exact: false }).waitFor()
  await library.getByLabel('Document title', { exact: true }).fill('ZX123 reference')
  await library.getByLabel('Document file', { exact: true }).setInputFiles({ name: 'ZX123.txt', mimeType: 'text/plain', buffer: Buffer.from('ZX123 supply voltage 3.3 V') })
  await library.getByRole('button', { name: 'Upload document', exact: true }).click()
  await library.getByRole('checkbox', { name: 'Use ZX123 reference', exact: true }).check()
  await library.getByRole('button', { name: 'Done', exact: true }).click()
  await input.fill('What is the ZX123 supply voltage?'); await send.click()
  await page.getByText('Sources (1)', { exact: true }).waitFor()
  assert.deepEqual(sends.at(-1).research.documentIds, [referenceId])
  assert.equal(sends.at(-1).research.mode, 'off')
  assert.equal(sends.at(-1).includeProjectContext, false)
  await page.reload(); await page.getByText('Sources (1)', { exact: true }).click()
  await page.getByRole('button', { name: '[S1] ZX123 reference · v1 · p. 1', exact: true }).click()
  await page.getByRole('dialog', { name: 'Source excerpt', exact: true }).getByText('ZX123 supply voltage 3.3 V.', { exact: false }).waitFor()
  assert.equal(await page.locator('.vf-document-excerpt script').count(), 0)
  await page.keyboard.press('Escape')
  await page.getByLabel('Chat options', { exact: true }).click()
  await page.getByRole('button', { name: 'Reference documents', exact: true }).click()
  assert.equal(await library.getByRole('checkbox', { name: 'Use ZX123 reference', exact: true }).isChecked(), false, 'Reload requires explicit document selection for future turns')
  await library.getByRole('button', { name: 'New version', exact: true }).click()
  await library.getByLabel('Document file', { exact: true }).setInputFiles({ name: 'ZX123.txt', mimeType: 'text/plain', buffer: Buffer.from('ZX123 supply voltage 5 V') })
  await library.getByRole('button', { name: 'Upload new version', exact: true }).click()
  await library.getByText('v2', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await library.getByRole('button', { name: 'Delete ZX123 reference', exact: true }).click()
  assert.equal(documentRows.size, 1, 'Deletion requires confirmation')
  await library.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
  await library.getByText('No matching documents.', { exact: false }).waitFor()
  await library.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: '[S1] ZX123 reference · v1 · p. 1', exact: true }).click()
  await page.getByRole('dialog', { name: 'Source excerpt', exact: true }).getByRole('alert').waitFor()
  assert.equal(transcripts.get('document-chat').length, 2, 'Document deletion preserves the chat')
  assert.deepEqual(errors, [])
  console.log('PASS multipart document upload, explicit selection with web off, source restore/read, safe text, version replacement and confirmed deletion')
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0]
  if (failedPage) await failedPage.screenshot({ path: 'test-results/chat/failure.png' }).catch(() => {})
  throw error
} finally { liveStream?.close(); await browser?.close(); await server.close() }
