import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const workers = [], previousWorker = globalThis.Worker
class WorkerFixture {
  constructor() { workers.push(this); this.stopped = false }
  postMessage(payload) { this.payload = structuredClone(payload) }
  terminate() { this.stopped = true }
  emit(data) { this.onmessage?.({ data }) }
}
globalThis.Worker = WorkerFixture
const check = async (name, action) => { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
let store
try {
  const { useCanvasStore } = await server.ssrLoadModule('/src/store/canvasStore.ts'); store = useCanvasStore
  const { createCanvasRouteCache, isCanvasRouteCacheValid } = await server.ssrLoadModule('/src/features/canvas/canvasRouteCache.ts')
  const { routeWireBetweenNodes, getPinAbsPos } = await server.ssrLoadModule('/src/utils/wireRouting.ts')
  const { captureEditorDocument } = await server.ssrLoadModule('/src/features/editor/editorDocumentSnapshots.ts')
  const { useProjectStore } = await server.ssrLoadModule('/src/store/projectStore.ts')
  const nodes = [{ id: 'a', type: 'RESISTOR', x: 50, y: 50, rotation: 90, properties: { resistance: 470 } }, { id: 'b', type: 'RESISTOR', x: 330, y: 210 }, { id: 'obstacle', type: 'RESISTOR', x: 190, y: 130 }]
  const wires = [{ id: 'auto', fromNodeId: 'a', fromPinId: 'pin2', toNodeId: 'b', toPinId: 'pin1', routingMode: 'auto', color: '#abcdef', label: 'preserve', bendPoints: [{ x: 9000, y: 9000 }] }, { id: 'manual', fromNodeId: 'a', fromPinId: 'pin1', toNodeId: 'b', toPinId: 'pin2', routingMode: 'curved', color: '#111111', bendPoints: [{ x: 90, y: 250 }] }]
  const load = () => store.getState().loadCanvas(nodes, wires)
  const complete = worker => {
    const routed = worker.payload.wires.map(wire => wire.routingMode === 'auto' ? { ...wire, bendPoints: routeWireBetweenNodes(wire, worker.payload.nodes) } : wire)
    worker.emit({ type: 'complete', wires: routed, routeCache: createCanvasRouteCache(worker.payload.nodes, routed) })
  }
  await check('Hydration preserves pin aliases and manual bends while deferring auto routes', () => {
    load(); const state = store.getState(), worker = workers.at(-1)
    assert.equal(state.routingStatus.phase, 'routing'); assert.equal(state.wires[0].fromPinId, 'p2'); assert.equal(state.wires[0].toPinId, 'p1')
    assert.deepEqual(state.wires[0].bendPoints, []); assert.deepEqual(state.wires[1].bendPoints, wires[1].bendPoints)
    assert.deepEqual(worker.payload.nodes[0].properties, {})
    const revision = state.modelRevision, local = state.localDocumentRevision
    complete(worker)
    const done = store.getState(); assert.equal(done.modelRevision, revision); assert.equal(done.localDocumentRevision, local)
    assert.equal(done.wires[0].color, '#abcdef'); assert.equal(done.wires[0].label, 'preserve')
    assert.deepEqual(done.wires[0].bendPoints, routeWireBetweenNodes(done.wires[0], done.nodes))
    assert.deepEqual(getPinAbsPos(done.nodes[0], 'p2'), getPinAbsPos(worker.payload.nodes[0], 'p2'))
  })
  await check('Exact versioned cache round-trips and save snapshots include it without runtime data', () => {
    const state = store.getState(), count = workers.length
    const saved = JSON.parse(JSON.stringify({ nodes: state.documentNodes, wires: state.wires, routeCache: state.routeCache }))
    store.getState().loadCanvas(saved.nodes, saved.wires, undefined, saved.routeCache)
    assert.equal(workers.length, count); assert.equal(store.getState().routingStatus.reused, 1)
    useProjectStore.getState().setCurrentProject({ id: 'routing', updatedAt: 'revision', codeFiles: [], owner: { keycloakId: 'owner' } })
    store.getState().updateRuntimeNode('a', { properties: { feedback: 12 } })
    const snapshot = captureEditorDocument()
    assert.equal(snapshot.payload.canvasLayout.routeCache, store.getState().routeCache)
    assert.equal(snapshot.payload.canvasLayout.nodes[0].properties.feedback, undefined)
  })
  await check('Version, geometry, pin, obstacle, connection and bend changes invalidate cache', () => {
    const state = store.getState(), cache = state.routeCache, originalNodes = state.documentNodes, originalWires = state.wires
    assert(isCanvasRouteCacheValid(cache, originalNodes, originalWires))
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) {
      const modified = structuredClone(originalNodes); modified[2][key] += 1
      assert(!isCanvasRouteCacheValid(cache, modified, originalWires), key)
    }
    const pins = structuredClone(originalNodes); pins[0].pins[0].x += 2
    assert(!isCanvasRouteCacheValid(cache, pins, originalWires))
    for (const key of ['fromPinId', 'toPinId', 'fromNodeId', 'toNodeId']) {
      const modified = structuredClone(originalWires); modified[0][key] += '-changed'
      assert(!isCanvasRouteCacheValid(cache, originalNodes, modified), key)
    }
    const bends = structuredClone(originalWires); bends[0].bendPoints = [{ x: 91, y: 27 }]
    assert(!isCanvasRouteCacheValid(cache, originalNodes, bends))
    assert(!isCanvasRouteCacheValid({ ...cache, version: 'old' }, originalNodes, originalWires))
    assert(!isCanvasRouteCacheValid(undefined, originalNodes, originalWires))
    const feedback = structuredClone(originalNodes); feedback[0].properties.feedback = 10
    assert(isCanvasRouteCacheValid(cache, feedback, originalWires))
  })
  await check('Runtime and selection updates retain an in-flight job and its authored references', () => {
    load(); const worker = workers.at(-1), count = workers.length, before = store.getState()
    for (let i=0;i<100;i++) {
      store.getState().updateRuntimeNode('a', { properties: { feedback: i } })
      store.getState().selectNode(i % 2 ? 'a' : null)
    }
    assert(!worker.stopped); assert.equal(workers.length, count)
    worker.emit({ type: 'progress', completed: 1 })
    assert.equal(store.getState().localDocumentRevision, before.localDocumentRevision)
    complete(worker); assert.equal(store.getState().nodes[0].properties.feedback, 99)
    assert.equal(store.getState().documentNodes[0].properties.feedback, undefined)
  })
  await check('Replacement, reset and explicit cancellation ignore late worker messages', () => {
    for (const action of [() => store.getState().loadCanvas([], []), () => store.getState().resetCanvas(), () => store.getState().cancelCanvasRouting()]) {
      load(); const worker = workers.at(-1); action(); const state = store.getState()
      assert(worker.stopped); complete(worker); assert.equal(store.getState(), state)
    }
  })
  await check('Edits and undo coalesce a replacement job and obsolete results never overwrite edits', async () => {
    load(); const old = workers.at(-1), count = workers.length
    store.getState().commitNodeUpdate('a', { x: 333 }); store.getState().updateNode('a', { y: 222 })
    store.getState().setViewport({ x: 9, y: 8, scale: 1 })
    assert(old.stopped); complete(old); assert.equal(store.getState().nodes[0].x, 333)
    await Promise.resolve(); assert.equal(workers.length, count + 1)
    assert.equal(workers.at(-1).payload.nodes[0].y, 222)
    const replacement = workers.at(-1); store.getState().undo(); await Promise.resolve()
    assert(replacement.stopped); complete(replacement); assert.equal(store.getState().nodes[0].x, 50)
    complete(workers.at(-1)); assert.equal(store.getState().routingStatus.phase, 'ready')
  })
  await check('Worker error and invalid responses retain data and can be retried', () => {
    load(); const worker = workers.at(-1), before = store.getState().wires
    worker.emit({ type: 'complete', wires: [], routeCache: {} })
    assert.equal(store.getState().routingStatus.phase, 'error'); assert.equal(store.getState().wires, before)
    store.getState().retryCanvasRouting(); complete(workers.at(-1)); assert.equal(store.getState().routingStatus.phase, 'ready')
    load(); workers.at(-1).onerror(); assert.equal(store.getState().routingStatus.phase, 'error')
    globalThis.Worker = class { constructor() { throw new Error('unsupported') } }
    store.getState().retryCanvasRouting(); assert.equal(store.getState().routingStatus.phase, 'error')
    globalThis.Worker = WorkerFixture; store.getState().retryCanvasRouting(); complete(workers.at(-1))
    assert.equal(store.getState().routingStatus.phase, 'ready')
  })
  await check('No-auto and legacy-straight documents retain the load contract', () => {
    const count = workers.length
    store.getState().loadCanvas(nodes, [wires[1]])
    assert.equal(workers.length, count); assert.equal(store.getState().routingStatus.phase, 'ready')
    store.getState().loadCanvas(nodes, [{ ...wires[0], routingMode: 'straight', bendPoints: [] }])
    assert.equal(store.getState().wires[0].routingMode, 'auto'); assert.equal(workers.length, count + 1)
    complete(workers.at(-1))
  })
} finally {
  store?.getState().cancelCanvasRouting(); globalThis.Worker = previousWorker
  await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-016-routing-contract-tests.json', import.meta.url), JSON.stringify({ task: 'VFOPT-UI-016', capturedAt: new Date().toISOString(), status: checks.length === 8 ? 'passed' : 'failed', checks }, null, 2) + '\n')
}
