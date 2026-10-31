import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
const fixture = JSON.parse(await readFile(new URL('../../Voltforge_AI/docs/contracts/chat-stream-v1.json', import.meta.url), 'utf8'))
const vite = await createServer({ appType: 'custom', logLevel: 'error', server: { middlewareMode: true } })
try {
  const { ChatTiming } = await vite.ssrLoadModule('/src/features/ai/chatTiming.ts')
  let now = 0
  const timing = new ChatTiming(() => now)
  const run = timing.start()
  now = 10; run.accepted(); run.accepted()
  now = 30; run.firstText(); run.firstText()
  now = 50; run.saved('completed'); run.finish(true); run.firstText()
  assert.equal(timing.snapshot().latencyMs.accepted.count, 1)
  assert.equal(timing.snapshot().latencyMs.firstText.maxMs, 30)
  assert.equal(timing.snapshot().latencyMs.saved.maxMs, 50)
  assert.deepEqual(timing.snapshot().outcomes, { completed: 1 })
  const partial = timing.start(); partial.firstText(); partial.finish(false)
  assert.equal(timing.snapshot().outcomes.unconfirmed, 1)
  assert.equal(timing.snapshot().latencyMs.saved.count, 1)
  const cancelledTiming = timing.start(); cancelledTiming.finish(true)
  assert.equal(timing.snapshot().outcomes.cancelled, 1)
  for (let i = 0; i < 1000; i++) { const sample = timing.start(); now++; sample.saved('private status ' + i) }
  const timings = timing.snapshot()
  assert.equal(timings.latencyMs.total.count, 256)
  assert.equal(timings.latencyMs.saved.count, 256)
  assert.equal(timings.outcomes.unconfirmed, 1001)
  assert(!JSON.stringify(timings).includes('private'))
  timings.outcomes.completed = 100
  assert.equal(timing.snapshot().outcomes.completed, 1)
  const { SseDecoder, ConversationStreamContract, readChatFrames } = await vite.ssrLoadModule('/src/features/ai/chatStream.ts')
  const encode = text => new TextEncoder().encode(text)
  let splits = 0
  for (const sample of fixture.framingCases) {
    const bytes = encode(sample.wire)
    for (let split = 0; split <= bytes.length; split++) {
      const parser = new SseDecoder()
      assert.deepEqual([...parser.push(bytes.slice(0, split)), ...parser.push(bytes.slice(split)), ...parser.finish()], [{ event: sample.event, data: sample.data }])
      splits++
    }
    const parser = new SseDecoder()
    assert.deepEqual([...bytes].flatMap(byte => parser.push(Uint8Array.of(byte))).concat(parser.finish()), [{ event: sample.event, data: sample.data }])
  }
  for (const wire of ['data: {"type":"token"}', 'data: {}\n', 'event: saved\n']) {
    const parser = new SseDecoder(); parser.push(encode(wire)); assert.throws(() => parser.finish())
  }
  assert.throws(() => new SseDecoder().push(Uint8Array.of(0xff)))
  assert.throws(() => new SseDecoder(10).push(encode('data: ' + 'a'.repeat(20))))
  assert.throws(() => new SseDecoder(100, 10).push(encode(': heartbeat\n\n')))
  const contract = () => new ConversationStreamContract(fixture.conversationId, fixture.clientRequestId)
  const saved = (role = 'user', status = 'completed') => ({ id: role, conversationId: fixture.conversationId, clientRequestId: fixture.clientRequestId, role, status, sequenceNumber: role === 'user' ? 1 : 2, content: fixture.answer })
  const accepted = { type: 'accepted', attemptId: fixture.attemptId, data: saved() }
  const settled = { type: 'saved', data: saved('assistant') }
  const state = contract()
  assert(state.accept('accepted', accepted))
  assert.equal(state.accept('accepted', accepted), false)
  for (const frame of fixture.upstreamFrames) assert(state.accept(frame.event, frame.data))
  assert.throws(() => state.finish(), 'AI complete is not persistence acknowledgement')
  assert(state.accept('saved', settled)); state.finish()
  assert.equal(state.accept('saved', settled), false)
  assert.equal(state.accept('token', { delta: 'late' }), false)
  for (const invalid of [null, [], { type: 'token', delta: 42 }, { type: 'token', delta: 'x', schemaVersion: 2 }, { type: 'token', delta: 'x', contractVersion: '2.0.0' }]) {
    const state = contract(); state.accept('accepted', accepted)
    assert.throws(() => state.accept('token', invalid))
  }
  const stale = contract(); stale.accept('accepted', accepted)
  assert.equal(stale.accept('sources', { type: 'sources', attemptId: 'old', citations: [] }), false)
  assert.equal(stale.accept('future', { type: 'future', reply: 'must not complete' }), false)
  assert.throws(() => stale.finish())
  assert(stale.accept('error', { type: 'error', code: 'AI_RESPONSE_LIMIT' }))
  assert.equal(stale.accept('complete', { type: 'complete', reply: 'late' }), false)
  assert(stale.accept('saved', { type: 'saved', data: saved('assistant', 'failed') }))
  const wrong = contract(); wrong.accept('accepted', accepted)
  assert.throws(() => wrong.accept('saved', { ...settled, data: { ...settled.data, conversationId: 'other' } }))
  assert.equal(wrong.accept('saved', { ...settled, attemptId: 'stale' }), false)
  assert.throws(() => wrong.accept('token', { type: 'token', payload: { schemaVersion: 2, delta: 'x' } }))
  const legacy = contract(); legacy.accept('accepted', { type: 'accepted', data: saved() })
  assert(legacy.accept('token', { type: 'token', schemaVersion: 1, contractVersion: '1.0.0', payload: { delta: 'legacy-compatible' } }))
  assert(legacy.accept('sources', { type: 'sources', citations: [] }))
  assert(legacy.accept('saved', settled)); legacy.finish()
  const oversized = contract(); oversized.accept('accepted', accepted)
  assert.throws(() => oversized.accept('token', { type: 'token', delta: 'a'.repeat(120001) }))
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(encode('data: {}\n\n')) }, cancel() { cancelled = true } })
  for await (const _frame of readChatFrames(body)) break
  assert(cancelled); assert.equal(body.locked, false)
  console.log(`PASS ${splits} UTF-8 split boundaries, single-byte chunks, CR/LF framing, limits, EOF, identity, stale events, terminal states and reader cleanup`)
} finally { await vite.close() }
