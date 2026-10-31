// Opt-in integration probe. Uses production browser transport/contract/timing modules,
// actual Spring persistence/gateway and native AI; identity/H2 are test fixtures.
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const backend = process.env.TELEMETRY_BACKEND
assert(/^http:\/\/127\.0\.0\.1:\d+\/voltForge-app$/.test(backend))
const vite = await createServer({ plugins: [{ name: 'isolated-telemetry-probe', configureServer(server) {
  server.middlewares.use('/__probe', (_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local telemetry probe</title>') })
} }], server: { host: '127.0.0.1', port: Number(process.env.TELEMETRY_BROWSER_PORT), strictPort: true,
  proxy: { '/probe-api': { target: backend, changeOrigin: true, rewrite: path => path.replace('/probe-api', '') } } } })
let browser
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__probe`)
  const result = await page.evaluate(async () => {
    const { ConversationStreamContract, readChatFrames } = await import('/src/features/ai/chatStream.ts')
    const { ChatTiming } = await import('/src/features/ai/chatTiming.ts')
    const timings = new ChatTiming()
    const headers = { Authorization: 'Bearer telemetry-probe', 'Content-Type': 'application/json' }
    const turns = []
    for (let index = 0; index < 5; index++) {
      const created = await fetch('/probe-api/api/v1/ai/conversations', { method: 'POST', headers, body: '{}' })
      if (!created.ok) throw new Error(`Conversation create failed: HTTP ${created.status}`)
      const conversation = (await created.json()).data
      const clientRequestId = crypto.randomUUID()
      const contract = new ConversationStreamContract(conversation.id, clientRequestId)
      const timer = timings.start()
      const response = await fetch(`/probe-api/api/v1/ai/conversations/${conversation.id}/messages/stream`, {
        method: 'POST', headers, body: JSON.stringify({ clientRequestId, message: 'In one short sentence, what does a resistor do?', research: { mode: 'off' } }) })
      if (!response.ok || !response.body) throw new Error('Stream unavailable')
      let status = 'unconfirmed'
      for await (const frame of readChatFrames(response.body)) {
        if (frame.data === '[DONE]') continue
        const root = JSON.parse(frame.data), event = { ...root, ...root.payload }
        const type = frame.event || event.type
        if (!contract.accept(type, root)) continue
        if (type === 'accepted') timer.accepted()
        if ((type === 'token' || type === 'delta') && (event.delta || event.token || event.content)) timer.firstText()
        if (type === 'saved') { status = event.data.status; timer.saved(status); break }
      }
      contract.finish(); timer.finish(false)
      if (status !== 'completed') throw new Error('Native answer did not complete')
      const reopened = await fetch(`/probe-api/api/v1/ai/conversations/${conversation.id}/messages`, { headers })
      const history = (await reopened.json()).data.content
      if (!history.some(message => message.role === 'assistant' && message.status === 'completed' && message.content)) throw new Error('Reopen failed')
      turns.push({ saved: true, reopened: true })
    }
    return { scope: 'loopback-native-with-test-identity-and-h2', samples: turns.length, browser: timings.snapshot(), checks: turns }
  })
  assert.equal(result.browser.outcomes.completed, 5)
  assert.equal(result.browser.latencyMs.firstText.count, 5)
  await writeFile(process.env.TELEMETRY_OUTPUT, JSON.stringify(result, null, 2))
  console.log('PASS five browser-to-native streams saved and reopened; sanitized timing report written')
} finally { await browser?.close(); await vite.close() }
