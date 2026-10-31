/** POST SSE framing. No reconnection or resend: the saved conversation owns recovery. */
export interface SseFrame { event: string; data: string }
export class ChatStreamError extends Error {
  constructor() { super('The response could not be confirmed. Refresh the conversation before retrying.'); this.name = 'ChatStreamError' }
}

export class SseDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true })
  private pending = ''
  private event = ''
  private data: string[] = []
  private frameSize = 0
  private total = 0
  constructor(private maxFrame = 1_000_000, private maxTotal = 8_000_000) {}
  push(bytes: Uint8Array): SseFrame[] {
    this.total += bytes.byteLength
    if (this.total > this.maxTotal) throw new ChatStreamError()
    try { return this.consume(this.decoder.decode(bytes, { stream: true }), false) }
    catch { throw new ChatStreamError() }
  }
  finish(): SseFrame[] {
    try {
      const frames = this.consume(this.decoder.decode(), true)
      // An unterminated event cannot become a fabricated terminal response.
      if (this.pending || this.data.length || this.event) throw new ChatStreamError()
      return frames
    } catch { throw new ChatStreamError() }
  }
  private consume(text: string, eof: boolean): SseFrame[] {
    this.pending += text
    const frames: SseFrame[] = []
    let start = 0
    for (let i = 0; i < this.pending.length; i++) {
      const char = this.pending[i]
      if (char !== '\r' && char !== '\n') continue
      if (char === '\r' && i === this.pending.length - 1 && !eof) break
      const line = this.pending.slice(start, i)
      if (char === '\r' && this.pending[i + 1] === '\n') i++
      start = i + 1
      this.frameSize += line.length + 1
      if (this.frameSize > this.maxFrame) throw new ChatStreamError()
      if (!line) {
        if (this.data.length) frames.push({ event: this.event, data: this.data.join('\n') })
        this.event = ''; this.data = []; this.frameSize = 0
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') this.event = value
        if (field === 'data') this.data.push(value)
      }
    }
    this.pending = this.pending.slice(start)
    if (this.pending.length + this.frameSize > this.maxFrame) throw new ChatStreamError()
    return frames
  }
}

export async function* readChatFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader()
  const decoder = new SseDecoder()
  let ended = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) { ended = true; yield* decoder.finish(); return }
      yield* decoder.push(value)
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const known = new Set(['accepted', 'saved', 'start', 'sources', 'status', 'thought', 'tool', 'uncertainty', 'citation', 'token', 'delta', 'proposal', 'error', 'metadata', 'done', 'complete'])

/** Validates control fields; presentation continues to validate optional domain metadata. */
export class ConversationStreamContract {
  settled = false
  private acceptedId?: string
  private attemptId?: string
  private outputEnded = false
  private outputCharacters = 0
  constructor(private conversationId: string, private clientRequestId: string) {}
  accept(type: string, envelope: unknown): boolean {
    if (this.settled) return false
    if (!object(envelope)) throw new ChatStreamError()
    if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 1) throw new ChatStreamError()
    if (envelope.contractVersion !== undefined && (typeof envelope.contractVersion !== 'string' || !/^1\.\d+\.\d+$/.test(envelope.contractVersion))) throw new ChatStreamError()
    if (!known.has(type)) return false
    if (envelope.type !== undefined && envelope.type !== type) throw new ChatStreamError()
    if (envelope.payload !== undefined && !object(envelope.payload)) throw new ChatStreamError()
    const event = { ...envelope, ...(object(envelope.payload) ? envelope.payload : {}) }
    if (event.type !== undefined && event.type !== type) throw new ChatStreamError()
    if (event.schemaVersion !== undefined && event.schemaVersion !== 1) throw new ChatStreamError()
    if (event.contractVersion !== undefined && (typeof event.contractVersion !== 'string' || !/^1\.\d+\.\d+$/.test(event.contractVersion))) throw new ChatStreamError()
    if (this.attemptId && (type === 'sources' || event.attemptId !== undefined) && event.attemptId !== this.attemptId) return false
    if (type === 'accepted' || type === 'saved') {
      const saved = event.data
      if (!object(saved) || saved.conversationId !== this.conversationId || saved.clientRequestId !== this.clientRequestId
          || typeof saved.id !== 'string' || !saved.id || typeof saved.content !== 'string' || saved.content.length > 120000
          || !Number.isSafeInteger(saved.sequenceNumber) || (saved.sequenceNumber as number) < 1
          || !['pending', 'completed', 'failed', 'interrupted'].includes(String(saved.status))
          || saved.role !== (type === 'accepted' ? 'user' : 'assistant')) throw new ChatStreamError()
      if (type === 'accepted') {
        if (this.acceptedId && this.acceptedId !== saved.id) throw new ChatStreamError()
        if (this.acceptedId) return false
        this.acceptedId = saved.id
        if (typeof event.attemptId === 'string') this.attemptId = event.attemptId
      } else {
        if (!this.acceptedId) throw new ChatStreamError()
        this.settled = true
      }
      return true
    }
    if (!this.acceptedId) throw new ChatStreamError()
    if (type === 'token' || type === 'delta') {
      if (this.outputEnded) throw new ChatStreamError()
      const delta = event.delta ?? event.token ?? event.content
      if (typeof delta !== 'string') throw new ChatStreamError()
      this.outputCharacters += delta.length
      if (this.outputCharacters > 120000) throw new ChatStreamError()
    }
    if (['complete', 'done', 'error'].includes(type)) {
      if (this.outputEnded) return false
      if (event.reply !== undefined && (typeof event.reply !== 'string' || event.reply.length > 120000)) throw new ChatStreamError()
      this.outputEnded = true
    }
    if (type === 'sources' && (!Array.isArray(event.citations) || event.citations.length > 5)) throw new ChatStreamError()
    return true
  }
  finish() { if (!this.settled) throw new ChatStreamError() }
}
