import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { createRatlineFixture } from './fixtures/ratline-fixture.mjs'

const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const check = async (name, action) => { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
let failure
try {
  const { RatlineEngine } = await server.ssrLoadModule('/src/features/pcb/RatlineEngine.ts')
  const { LegacyRatlineEngine } = await server.ssrLoadModule('/scripts/fixtures/legacyRatlineEngine.ts')
  const { PcbSchematicSync } = await server.ssrLoadModule('/src/features/pcb/pcbSchematicSync.ts')
  const call = (f, cache) => RatlineEngine.computeRatlines(f.nodes, f.wires, f.footprints, f.traces, cache)
  const legacy = f => LegacyRatlineEngine.computeRatlines(f.nodes, f.wires, f.footprints, f.traces)
  const equal = (f, cache) => { const output = call(f, cache); assert.deepEqual(output, legacy(f)); return output }
  const countDistances = action => { const original = Math.hypot; let count = 0; Math.hypot = (...args) => { count++; return original(...args) }; try { return { result: action(), count } } finally { Math.hypot = original } }
  await check('32/64/128/512-pad MSTs exactly match the original edges, ordering, net IDs and coordinates', () => {
    for (const size of [32, 64, 128, 512]) {
      const f = createRatlineFixture(size), { result, count } = countDistances(() => call(f))
      assert.equal(count, size * (size - 1) / 2); assert.deepEqual(result, legacy(f)); assert.equal(result.length, size - 1)
    }
  })
  await check('Equal-distance grids, overlapping pads, rotations and shuffled footprint orders retain insertion-order ties', () => {
    for (const scenario of ['grid', 'overlap', 'line', 'rotation', 'reversed']) {
      const f = createRatlineFixture(24)
      f.footprints = f.footprints.map((fp, i) => ({ ...fp, x: scenario === 'overlap' ? 0 : i % 6, y: scenario === 'line' || scenario === 'overlap' ? 0 : Math.floor(i / 6), rotation: scenario === 'rotation' ? (i % 4) * 90 : 0 }))
      if (scenario === 'reversed') f.footprints.reverse()
      equal(f)
    }
  })
  await check('Deterministic random branching, disconnected, self-loop and duplicate-wire graphs match the legacy oracle', () => {
    let seed = 12681; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    for (let run = 0; run < 100; run++) {
      const f = createRatlineFixture(8 + run % 30)
      f.footprints = f.footprints.map(fp => ({ ...fp, x: Math.floor(random() * 8) - 4, y: Math.floor(random() * 8) - 4, rotation: Math.floor(random() * 4) * 90 }))
      f.wires = f.wires.filter(() => random() > .2).map(w => ({ ...w, fromNodeId: f.nodes[Math.floor(random() * f.nodes.length)].id }))
      if (run % 2 && f.wires.length) f.wires.push({ ...f.wires[0], id: 'duplicate' })
      if (run % 3) f.wires.reverse()
      equal(f)
    }
  })
  await check('Subpixel, negative and large coordinates preserve Math.hypot comparison and deterministic output', () => {
    for (const scale of [.00001, .05, 1e10, 1e150, 1e308]) {
      const f = createRatlineFixture(12)
      f.footprints = f.footprints.map((fp, i) => ({ ...fp, x: (i - 5) * scale, y: (i % 2 - 1) * scale }))
      equal(f)
    }
  })
  await check('Malformed nonfinite geometry uses deterministic compatibility fallback without hanging', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      const f = createRatlineFixture(6); f.footprints[1] = { ...f.footprints[1], x: value }; equal(f)
    }
  })
  await check('Trace suppression preserves strict 0.05 tolerance, either direction, endpoint-only semantics and legacy net labels', () => {
    const f = createRatlineFixture(8), edge = legacy(f)[0]
    for (const delta of [0, .049999, .05, .050001, -.049999, -.05]) {
      for (const reversed of [false, true]) {
        const points = [{ ...edge.from, x: edge.from.x + delta }, { x: -500, y: -500 }, { ...edge.to, x: edge.to.x + delta }]
        if (reversed) points.reverse()
        equal({ ...f, traces: [{ id: 'route', netId: 'unrelated-legacy-wire-id', layer: 'B.Cu', width_mm: .2, points }] })
      }
    }
    equal({ ...f, traces: [{ id: 'short', points: [edge.from] }, { id: 'invalid', points: [{ x: NaN, y: 0 }, edge.to] }] })
  })
  await check('Trace spatial buckets work across zero and negative boundaries with duplicate coincident routes', () => {
    const f = createRatlineFixture(12); f.footprints = f.footprints.map((fp, i) => ({ ...fp, x: i * .05 - .3, y: -.8 }))
    const edges = legacy(f)
    f.traces = edges.filter((_, i) => i % 2).flatMap((edge, i) => Array.from({ length: 3 }, (_, j) => ({ id: `t${i}-${j}`, netId: edge.netId, layer: 'F.Cu', width_mm: .2, points: [{ ...edge.from, x: edge.from.x + .024 }, { ...edge.to, x: edge.to.x - .024 }] })))
    equal(f)
  })
  await check('Unchanged and metadata-only nets reuse output without distance evaluations', () => {
    const f = createRatlineFixture(64, 3), cache = new RatlineEngine(), before = equal(f, cache)
    const changed = { ...f, nodes: f.nodes.map(n => ({ ...n, x: 999 })), wires: f.wires.map(w => ({ ...w, bendPoints: [], color: '#ffffff' })), footprints: f.footprints.map(fp => ({ ...fp, name: 'metadata', packageType: 'package', pads: fp.pads.map(p => ({ ...p, name: 'pad', netId: 'metadata' })) })) }
    const result = countDistances(() => call(changed, cache)); assert.equal(result.count, 0); assert.equal(result.result, before)
    assert.deepEqual(result.result, legacy(changed))
  })
  await check('One footprint movement rebuilds just its affected net and reuses other ratline objects', () => {
    const f = createRatlineFixture(128, 4), cache = new RatlineEngine(), before = call(f, cache)
    f.footprints = f.footprints.map((fp, i) => i ? fp : { ...fp, x: fp.x + 2 })
    const result = countDistances(() => call(f, cache)); assert.equal(result.count, 128 * 127 / 2)
    assert.equal(result.result.filter(r => before.includes(r)).length, 3 * 127); assert.deepEqual(result.result, legacy(f))
  })
  await check('A footprint spanning several nets invalidates each changed pad net while reusing unrelated nets', () => {
    const f = createRatlineFixture(8, 3)
    const extra = { ...f.footprints[0].pads[0], id: 'p2', x: 2 }
    f.footprints[0].pads.push(extra); f.nodes[0].pins.push({ ...f.nodes[0].pins[0], id: 'p2' })
    f.wires.push({ ...f.wires[0], id: 'bridge-pad', fromNodeId: 'n0-0', fromPinId: 'p2', toNodeId: 'n1-0' })
    const cache = new RatlineEngine(), before = call(f, cache)
    f.footprints[0] = { ...f.footprints[0], x: 16 }
    const result = countDistances(() => call(f, cache)); assert.equal(result.count, 8 * 7 / 2 + 9 * 8 / 2)
    assert.equal(result.result.filter(r => before.includes(r)).length, 7); assert.deepEqual(result.result, legacy(f))
  })
  await check('Adding, editing, reordering and removing traces reuse MSTs and refresh only displayed suppression', () => {
    const f = createRatlineFixture(32, 2), cache = new RatlineEngine(), before = call(f, cache), edge = before[0]
    const route = { id: 'r', netId: 'legacy', layer: 'F.Cu', width_mm: .2, points: [edge.from, edge.to] }
    for (const traces of [[route], [{ ...route, points: [...route.points].reverse() }], [{ ...route, points: [edge.from, { x: -10, y: -10 }, edge.to], width_mm: 1 }], [], [{ ...route, points: [edge.from, { ...edge.to, x: edge.to.x + 1 }] }]]) {
      f.traces = traces; const result = countDistances(() => call(f, cache)); assert.equal(result.count, 0); assert.deepEqual(result.result, legacy(f))
    }
  })
  await check('Connectivity merge, split, reorder, missing endpoints and deleted pads invalidate safely', () => {
    const f = createRatlineFixture(12, 2), cache = new RatlineEngine(); equal(f, cache)
    f.wires = [...f.wires, { ...f.wires[0], id: 'merge', fromNodeId: 'n0-0', toNodeId: 'n1-0' }]; equal(f, cache)
    f.wires = f.wires.slice(1).reverse(); equal(f, cache)
    f.footprints = f.footprints.slice(2); f.nodes = f.nodes.slice(2); equal(f, cache)
    f.wires = []; equal(f, cache)
    f.footprints = []; assert.deepEqual(call(f, cache), [])
    const replacement = createRatlineFixture(12, 2); equal(replacement, cache)
  })
  await check('Cache keeps only current nets and footprints across repeated document replacement', () => {
    const cache = new RatlineEngine()
    for (let run = 0; run < 60; run++) {
      const f = createRatlineFixture(16, 2)
      const rename = id => `doc${run}-${id}`
      f.nodes = f.nodes.map(n => ({ ...n, id: rename(n.id) }))
      f.footprints = f.footprints.map(fp => ({ ...fp, componentId: rename(fp.componentId) }))
      f.wires = f.wires.map(w => ({ ...w, fromNodeId: rename(w.fromNodeId), toNodeId: rename(w.toNodeId) }))
      equal(f, cache)
      // TypeScript private fields are inspected only in diagnostics to verify bounds.
      assert.equal(cache.netCache.size, 2); assert.equal(cache.footprintCache.size, 32)
    }
    call({ nodes: [], wires: [], footprints: [], traces: [] }, cache)
    assert.equal(cache.netCache.size, 0); assert.equal(cache.footprintCache.size, 0)
  })
  await check('Schematic synchronization retains per-net cache while preserving authored placement and trace arrays', () => {
    const f = createRatlineFixture(64, 2), sync = new PcbSchematicSync()
    let state = sync.reconcile(f.nodes, f.wires, f.footprints, f.traces)
    const moved = state.footprints.map((fp, i) => i ? fp : { ...fp, x: 18, rotation: 90 })
    const result = countDistances(() => sync.reconcile(f.nodes, f.wires, moved, f.traces))
    assert.equal(result.count, 64 * 63 / 2); state = result.result
    assert.equal(state.footprints[0], moved[0]); assert.deepEqual(state.ratlines, legacy({ ...f, footprints: moved }))
    const edge = state.ratlines[0], traces = [{ id: 'r', netId: edge.netId, layer: 'F.Cu', width_mm: .2, points: [edge.from, edge.to] }]
    const routed = countDistances(() => sync.reconcile(f.nodes, f.wires, state.footprints, traces)); assert.equal(routed.count, 0)
    assert.deepEqual(routed.result.ratlines, legacy({ ...f, footprints: moved, traces }))
  })
  await check('An empty schematic releases its owned ratline caches before a same-ID replacement', () => {
    const f = createRatlineFixture(64, 2), sync = new PcbSchematicSync()
    const first = sync.reconcile(f.nodes, f.wires, f.footprints, f.traces)
    assert.equal(sync.ratlineEngine.netCache.size, 2)
    const empty = sync.reconcile([], [], first.footprints, [])
    assert.equal(empty.ratlines.length, 0); assert.equal(sync.ratlineEngine.netCache.size, 0); assert.equal(sync.ratlineEngine.footprintCache.size, 0)
    const replacement = createRatlineFixture(32)
    const next = sync.reconcile(replacement.nodes, replacement.wires, [], replacement.traces)
    assert.deepEqual(next.ratlines, legacy({ ...replacement, footprints: next.footprints }))
  })
} catch (error) { failure = error; checks.push({ name: 'Contract failure', passed: false, error: error.stack }) }
finally {
  await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-026-ratline-contract-tests.json', import.meta.url), JSON.stringify({ task: 'VFOPT-UI-026', capturedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', checks, oracle: { file: 'scripts/fixtures/legacyRatlineEngine.ts', sha256: crypto.createHash('sha256').update(fs.readFileSync(new URL('./fixtures/legacyRatlineEngine.ts', import.meta.url))).digest('hex'), provenance: 'Preserved pre-VFOPT-UI-026 engine; only class name and type-import paths changed.' } }, null, 2) + '\n')
}
if (failure) throw failure
