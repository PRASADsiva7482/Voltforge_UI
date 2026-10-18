import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true } })
try {
  const { parseAvrHex } = await server.ssrLoadModule('/src/features/simulator/intelHex.ts')
  const valid = ':0200000000C03E\n:00000001FF'
  const program = parseAvrHex(valid)
  assert.equal(program.length, 16384); assert.equal(program[0], 0xc000); assert.equal(program[1], 0xffff)
  for (const invalid of ['', ':', ':0200000000C03F\n:00000001FF', ':0200000000C03E', ':00000001FF', ':0200000000C03E\n:00000001FF\n:0200000000C03E', ':0280000000C0BE\n:00000001FF', ':020000040001F9\n:0200000000C03E\n:00000001FF', ':0300000000C03E\n:00000001FF']) {
    assert.throws(() => parseAvrHex(invalid), /HEX/)
  }
  console.log('PASS AVR HEX checksum, record length, EOF, address bounds, flash size, extended addresses and byte ordering')
} finally { await server.close() }
