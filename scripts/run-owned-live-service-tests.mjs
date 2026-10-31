import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { OwnedLiveService, portOpen } from './owned-live-service.mjs'

const listener = createServer()
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
const port = listener.address().port
const service = overrides => new OwnedLiveService({ command: process.execPath,
  args: ['-e', `require('node:net').createServer().listen(${port}, '127.0.0.1')`],
  cwd: process.cwd(), env: process.env, port, ready: () => portOpen(port), timeout: 5000, ...overrides })
try {
  await assert.rejects(service().start(), {code:'LOCAL_SERVICE_PORT_OCCUPIED'})
  assert.equal(await portOpen(port),true,'must not stop a pre-existing service')
} finally { await new Promise(resolve => listener.close(resolve)) }
const owned = service()
try {
  await owned.start()
  await assert.rejects(owned.start(), {code:'OWNED_SERVICE_ALREADY_STARTED'})
  await owned.stop()
  assert.equal(await portOpen(port),false)
  await owned.start()
  assert.equal(await portOpen(port),true,'restart launches another actual child')
  await owned.stop({force:true})
  assert.equal(await portOpen(port),false,'forced crash waits for the owned child and socket release')
  await owned.start()
  for (let attempt=0; attempt<3; attempt++) {
    await owned.stop()
    assert.equal(await portOpen(port),false,'stop waits for socket release')
    await owned.start()
  }
} finally { await owned.stop() }
await owned.stop() // Idempotent cleanup.
await assert.rejects(service({args:['-e','process.exit(2)']}).start(), {code:'OWNED_SERVICE_EXITED'})
await assert.rejects(service({ready:async()=>false, timeout:500}).start(), {code:'OWNED_SERVICE_START_TIMEOUT'})
assert.equal(await portOpen(port),false,'startup failure must clean up its child')
await assert.rejects(service({command:'voltforge-missing-test-executable'}).start(), {code:'OWNED_SERVICE_EXITED'})
assert.equal(await portOpen(port),false)
console.log('Owned service tests passed: occupied port protection, duplicate start, stop/restart, failed launch, readiness timeout and cleanup.')
