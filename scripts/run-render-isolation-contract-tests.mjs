import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const check = (name, fn) => { fn(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
let failure
try {
  const { createWireNodeGeometrySelector } = await server.ssrLoadModule('/src/features/canvas/wireNodeGeometry.ts')
  const { getWireRenderPoints } = await server.ssrLoadModule('/src/utils/wireRouting.ts')
  const { componentPairKey } = await server.ssrLoadModule('/src/utils/wireRouting.ts')
  const { WireRoutingPeerCache } = await server.ssrLoadModule('/src/features/canvas/wireRoutingPeers.ts')
  const a = { id: 'a', type: 'RESISTOR', name: 'R', x: 0, y: 0, width: 90, height: 24, rotation: 0, pins: [{ id: 'p', name: 'SIGNAL', x: 90, y: 12, type: 'bidirectional' }], properties: { resistance: 1000 } }
  const b = { ...a, id: 'b', x: 300, y: 200 }
  const state = nodes => ({ nodesById: new Map(nodes.map(n => [n.id, n])) })
  check('Unchanged, runtime and electrical-property-only updates retain endpoint geometry identity', () => {
    const select = createWireNodeGeometrySelector('a')
    assert.equal(select(state([a, b])), a)
    for (const properties of [{ voltage: 5, isActive: true }, { resistance: 2000 }, { ledColor: 'blue', locked: true }]) assert.equal(select(state([{ ...a, properties }, b])), a)
    assert.equal(select(state([a, { ...b, x: 999 }])), a)
  })
  check('Movement, rotation, resize, type and pin coordinate/alias changes invalidate geometry', () => {
    for (const patch of [{ x: 50 }, { y: 60 }, { width: 120 }, { height: 90 }, { rotation: 90 }, { type: 'CUSTOM_TEST' }, { pins: [{ ...a.pins[0], x: 120 }] }, { pins: [{ ...a.pins[0], name: 'RENAMED' }] }]) {
      const select = createWireNodeGeometrySelector('a'); select(state([a, b])); const changed = { ...a, ...patch }
      assert.equal(select(state([changed, b])), changed)
    }
  })
  check('Deletion, missing endpoints, same-ID document replacement and undo/redo cannot reuse stale geometry', () => {
    const select = createWireNodeGeometrySelector('a')
    assert.equal(select(state([])), undefined); select(state([a])); assert.equal(select(state([])), undefined)
    const replaced = { ...a, x: 400, pins: a.pins.map(p => ({ ...p, id: 'new' })) }
    assert.equal(select(state([replaced])), replaced); assert.equal(select(state([a])), a); assert.equal(select(state([replaced])), replaced)
  })
  check('Cached endpoints match fresh routing across every routing mode, manual bends and pin-name aliases', () => {
    const selectA = createWireNodeGeometrySelector('a'), selectB = createWireNodeGeometrySelector('b')
    for (const routingMode of ['straight', 'curved', 'orthogonal', 'auto']) for (const rotation of [0, 45, 180]) {
      const nodes = [{ ...a, rotation, properties: { voltage: rotation } }, { ...b, width: 130 }]
      const wire = { id: 'wire', fromNodeId: 'a', fromPinId: 'SIGNAL', toNodeId: 'b', toPinId: 'p', routingMode, color: '#22c55e', bendPoints: [{ x: 100, y: 20 }] }
      assert.deepEqual(getWireRenderPoints(wire, [selectA(state(nodes)), selectB(state(nodes))]), getWireRenderPoints(wire, nodes))
    }
  })
  const wire = { id: 'w', fromNodeId: 'a', fromPinId: 'p', toNodeId: 'b', toPinId: 'p', routingMode: 'auto', color: 'red', bendPoints: [] }
  check('Only changed component-pair membership invalidates routing peer identity', () => {
    const cache = new WireRoutingPeerCache(), other = { ...wire, id: 'other', fromNodeId: 'c', toNodeId: 'd' }
    const first = cache.update([wire, other]), key = componentPairKey(wire), otherKey = componentPairKey(other)
    const changed = cache.update([{ ...wire, label: 'new', color: 'blue', bendPoints: [{ x: 4, y: 5 }] }, other])
    assert.equal(changed.get(key), first.get(key)); assert.equal(changed.get(otherKey), first.get(otherKey))
    const added = cache.update([wire, other, { ...wire, id: 'peer', fromNodeId: 'b', toNodeId: 'a' }])
    assert.notEqual(added.get(key), first.get(key)); assert.equal(added.get(otherKey), first.get(otherKey))
    assert.equal(cache.update([other]).has(key), false); assert.equal(cache.update([]).size, 0)
    assert.notEqual(cache.update([wire]).get(key), first.get(key))
  })
  check('Partitioned peers preserve complete-router points for reversed pairs, lanes, modes and reordered documents', () => {
    const nodes = [a, b, { ...a, id: 'c', x: -400 }], cache = new WireRoutingPeerCache()
    for (const routingMode of ['straight', 'orthogonal', 'curved', 'auto']) {
      const wires = [wire, { ...wire, id: 'w2', fromNodeId: 'b', toNodeId: 'a' }, { ...wire, id: 'unrelated', fromNodeId: 'c' }].map(w => ({ ...w, routingMode }))
      for (const ordered of [wires, [...wires].reverse()]) {
        const peers = cache.update(ordered)
        for (const w of ordered) assert.deepEqual(getWireRenderPoints(w, nodes, w.bendPoints, peers.get(componentPairKey(w))), getWireRenderPoints(w, nodes, w.bendPoints, ordered))
      }
    }
  })
} catch (e) { failure = e; console.error(e.stack) }
finally {
  fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/reports/vfopt-ui-015-contract.json'), JSON.stringify({ task: 'VFOPT-UI-015', capturedAt: new Date().toISOString(), checks, failure: failure?.message ?? null }, null, 2) + '\n')
  await server.close()
}
if (failure) process.exitCode = 1
