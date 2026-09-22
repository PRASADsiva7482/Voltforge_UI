import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const check = async (name, action) => { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
let disconnect, unsubscribe, compute, engine, failure
try {
  const { PcbSchematicSync } = await server.ssrLoadModule('/src/features/pcb/pcbSchematicSync.ts')
  const { RatlineEngine } = await server.ssrLoadModule('/src/features/pcb/RatlineEngine.ts')
  const { usePcbStore: pcb } = await server.ssrLoadModule('/src/store/pcbStore.ts')
  const { useCanvasStore: canvas } = await server.ssrLoadModule('/src/store/canvasStore.ts')
  const { useProjectStore: project } = await server.ssrLoadModule('/src/store/projectStore.ts')
  const { captureEditorDocument, hasEditsSince } = await server.ssrLoadModule('/src/features/editor/editorDocumentSnapshots.ts')
  engine = RatlineEngine; compute = engine.computeRatlines; let computations = 0
  engine.computeRatlines = (...args) => { computations++; return compute(...args) }
  const node = id => ({ id, componentId: id, type: 'CUSTOM', name: id, x: 10, y: 10, width: 40, height: 40, rotation: 0, properties: {}, pins: ['p1', 'p2'].map(id => ({ id, name: id, type: 'bidirectional', x: 0, y: 0 })) })
  const wire = (id, from, to, pin = 'p1') => ({ id, fromNodeId: from, fromPinId: pin, toNodeId: to, toPinId: pin, routingMode: 'curved', bendPoints: [{ x: 10, y: 10 }], color: '#00ff00' })
  const nodes = Array.from({ length: 100 }, (_, i) => node('n' + i))
  const wires = [wire('first', 'n0', 'n1'), wire('branch', 'n0', 'n2'), wire('other', 'n3', 'n4')]
  let sync = new PcbSchematicSync(), state = sync.reconcile(nodes, wires, [], [])
  const equivalent = (n, w, s, traces = []) => assert.deepEqual(s.ratlines, compute(n, w, s.footprints, traces))
  await check('Initial generated layout retains generic dimensions, pad IDs, ordered first-wire net IDs and ratline output', () => {
    assert.equal(state.footprints.length, 100)
    assert.equal(state.footprints[0].x, 20); assert.equal(state.footprints[5].y, 38)
    assert.deepEqual(state.footprints[0].pads.map(p => p.id), ['p1', 'p2'])
    assert.equal(state.footprints[0].pads[0].netId, 'first'); assert.equal(state.footprints[0].pads[1].netId, undefined)
    equivalent(nodes, wires, state)
  })
  await check('Geometry, electrical properties, pin coordinates, wire bends and colors preserve footprint and ratline references', () => {
    const before = state, count = computations
    state = sync.reconcile(nodes.map(n => ({ ...n, x: 999, rotation: 90, properties: { resistance: 1000, isLit: true }, pins: n.pins.map(p => ({ ...p, x: 200 })) })), wires.map(w => ({ ...w, color: '#ff0000', bendPoints: [] })), state.footprints, [])
    assert.equal(state.footprints, before.footprints); assert.deepEqual(state.ratlines, before.ratlines)
    // Use stable persisted trace input, just as the store does.
    const traces = []; state = sync.reconcile(nodes, wires, state.footprints, traces); const stable = state, calls = computations
    state = sync.reconcile(nodes.map(n => ({ ...n, x: 111 })), wires, state.footprints, traces)
    assert.equal(state.ratlines, stable.ratlines); assert.equal(computations, calls); assert(computations >= count)
  })
  await check('Adding one isolated part preserves all previous objects and does not invalidate ratlines', () => {
    const traces = []; state = sync.reconcile(nodes, wires, state.footprints, traces)
    const before = state, count = computations
    const next = sync.reconcile([...nodes, node('added')], wires, state.footprints, traces)
    assert(next.footprints.slice(0, 100).every((fp, i) => fp === before.footprints[i])); assert.equal(next.footprints.length, 101)
    assert.equal(next.ratlines, before.ratlines); assert.equal(computations, count)
  })
  await check('Changing one connection updates only affected pad membership and matches full ratline computation', () => {
    state = sync.reconcile(nodes, wires, state.footprints, [])
    const before = state, changed = [wire('replacement', 'n0', 'n5'), ...wires.slice(1)]
    const next = sync.reconcile(nodes, changed, state.footprints, [])
    assert.equal(next.footprints.filter((fp, i) => fp !== before.footprints[i]).length, 3)
    assert.equal(next.footprints[1].pads[0].netId, undefined); assert.equal(next.footprints[5].pads[0].netId, 'replacement')
    assert.equal(next.footprints[0].pads[1], before.footprints[0].pads[1]); equivalent(nodes, changed, next)
  })
  await check('Reordering wire membership preserves first-incident net IDs and branching output', () => {
    const changed = [wires[1], wires[0], wires[2]], next = sync.reconcile(nodes, changed, state.footprints, [])
    assert.equal(next.footprints[0].pads[0].netId, 'branch'); equivalent(nodes, changed, next)
  })
  await check('Metadata edits preserve saved custom pad geometry, placement, footprint identity and copper', () => {
    const saved = state.footprints.map((fp, i) => i ? fp : { ...fp, id: 'saved-custom', x: 43, y: 57, rotation: 90, width: 19, pads: fp.pads.map(p => ({ ...p, x: 7, drillDiameter: 1.1 })) })
    const changed = nodes.map((n, i) => i ? n : { ...n, name: 'renamed', properties: { footprint: 'SMD' }, pins: n.pins.map(p => ({ ...p, name: 'named ' + p.id })) })
    const next = sync.reconcile(changed, wires, saved, [])
    const fp = next.footprints[0]; assert.equal(fp.id, 'saved-custom'); assert.equal(fp.x, 43); assert.equal(fp.y, 57); assert.equal(fp.rotation, 90)
    assert.equal(fp.width, 19); assert.equal(fp.pads[0].x, 7); assert.equal(fp.pads[0].drillDiameter, 1.1); assert.equal(fp.packageType, 'SMD')
    equivalent(changed, wires, next)
  })
  await check('Pin add, removal and reorder regenerate only that footprint and preserve placed identity', () => {
    let current = state
    for (const pins of [[...nodes[0].pins, { ...nodes[0].pins[0], id: 'p3' }], [nodes[0].pins[1]], [...nodes[0].pins].reverse()]) {
      const changed = nodes.map((n, i) => i ? n : { ...n, pins }), next = sync.reconcile(changed, wires, current.footprints, [])
      assert(next.footprints.slice(1).every((fp, i) => fp === current.footprints[i + 1])); assert.deepEqual(next.footprints[0].pads.map(p => p.id), pins.map(p => p.id))
      assert.equal(next.footprints[0].id, current.footprints[0].id); assert.equal(next.footprints[0].x, current.footprints[0].x)
      equivalent(changed, wires, next); current = next
    }
  })
  await check('Routing suppression, missing wire endpoints and empty documents match the existing engine', () => {
    state = sync.reconcile(nodes, wires, state.footprints, [])
    const edge = state.ratlines[0], traces = [{ id: 'copper', netId: edge.netId, layer: 'F.Cu', width_mm: .25, points: [edge.from, edge.to] }]
    const next = sync.reconcile(nodes, wires, state.footprints, traces); assert.equal(next.ratlines.length, state.ratlines.length - 1); equivalent(nodes, wires, next, traces)
    const missing = [...wires, wire('missing', 'n1', 'absent')], incomplete = sync.reconcile(nodes, missing, next.footprints, traces); equivalent(nodes, missing, incomplete, traces)
    const empty = sync.reconcile([], [], incomplete.footprints, traces); assert.equal(empty.footprints.length, 0); assert.equal(empty.ratlines.length, 0)
  })

  const read = () => ({ nodes: canvas.getState().documentNodes, wires: canvas.getState().wires })
  canvas.getState().loadCanvas(nodes, wires); pcb.getState().resetPcb()
  disconnect = pcb.getState().connectSchematic(read)
  unsubscribe = canvas.subscribe((s, old) => { if (s.documentNodes !== old.documentNodes || s.wires !== old.wires) pcb.getState().requestSchematicSync() })
  const tick = () => Promise.resolve()
  await tick()
  await check('Store coalesces synchronous edits into one derived publication without local dirty revisions or self-rescheduling', async () => {
    let published = 0; const before = pcb.getState(), stop = pcb.subscribe(() => published++)
    for (let i = 0; i < 10; i++) canvas.getState().commitNodeUpdate('n0', { name: 'Name ' + i })
    assert.equal(published, 0); await tick(); assert.equal(published, 1); await tick(); assert.equal(published, 1); stop()
    assert.equal(pcb.getState().footprints[0].name, 'Name 9'); assert.equal(pcb.getState().localDocumentRevision, before.localDocumentRevision)
  })
  await check('Immediate editor save snapshot flushes pending PCB identity and membership with no dirty echo', () => {
    project.getState().setCurrentProject({ id: 'pcb-test', updatedAt: 'r1', owner: { keycloakId: 'owner' }, codeFiles: [], componentConfig: { keep: true } })
    canvas.getState().commitNodeUpdate('n0', { name: 'saved now' }); canvas.getState().removeWire('first')
    const snapshot = captureEditorDocument(), layout = snapshot.payload.componentConfig.pcbLayout
    assert.equal(layout.footprints[0].name, 'saved now'); assert.equal(layout.footprints[0].pads[0].netId, 'branch')
    assert.equal(snapshot.payload.componentConfig.keep, true); assert.equal(hasEditsSince(snapshot), false)
  })
  await check('Schematic delete, undo and redo retain PCB placement, pad IDs, traces and vias', async () => {
    pcb.getState().updateFootprintPosition('fp_n0', 43, 57, 90)
    pcb.getState().addTrace({ id: 'keep', netId: 'branch', layer: 'F.Cu', width_mm: .2, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })
    pcb.getState().addVia({ id: 'via', x: 5, y: 5, drill_mm: .3, pad_mm: .6 }); await tick()
    const saved = pcb.getState().getLayout(), placed = saved.footprints[0]
    canvas.getState().removeNode('n0'); await tick(); assert(!pcb.getState().footprints.some(fp => fp.componentId === 'n0'))
    canvas.getState().undo(); await tick(); assert.deepEqual(pcb.getState().footprints.find(fp => fp.componentId === 'n0'), placed)
    assert.equal(pcb.getState().traces, saved.traces); assert.equal(pcb.getState().vias, saved.vias)
    canvas.getState().redo(); await tick(); assert(!pcb.getState().footprints.some(fp => fp.componentId === 'n0'))
    canvas.getState().undo(); await tick()
  })
  await check('Scene detach flushes final source, invalidates callbacks and retains undo placement on remount', async () => {
    canvas.getState().removeNode('n0'); disconnect(); const detached = pcb.getState()
    await tick(); assert.equal(pcb.getState(), detached)
    canvas.getState().undo(); await tick(); assert.equal(pcb.getState(), detached)
    disconnect = pcb.getState().connectSchematic(read); await tick()
    assert.equal(pcb.getState().footprints.find(fp => fp.componentId === 'n0').x, 43)
    // StrictMode's setup/cleanup/setup also must discard the first queued callback.
    disconnect(); const early = pcb.getState().connectSchematic(read); early(); disconnect = pcb.getState().connectSchematic(read)
    await tick(); assert.equal(pcb.getState().footprints.length, 100)
  })
  await check('Saved layout roundtrip and same-ID project replacement use latest source and clear archived placements', async () => {
    const saved = structuredClone(pcb.getState().getLayout())
    pcb.getState().loadPcb(saved); await tick(); assert.deepEqual(pcb.getState().getLayout(), saved)
    canvas.getState().removeNode('n0'); await tick()
    // Reverse loading order must also coalesce into the final document, with no old archive.
    pcb.getState().resetPcb(); canvas.getState().loadCanvas(nodes, wires); await tick()
    assert.equal(pcb.getState().footprints[0].x, 20); assert.equal(pcb.getState().footprints[0].rotation, 0)
    assert.equal(pcb.getState().traces.length, 0); assert.equal(pcb.getState().vias.length, 0)
    canvas.getState().loadCanvas(nodes, wires); pcb.getState().loadPcb(saved); await tick()
    assert.equal(pcb.getState().footprints[0].x, 43)
  })
  await check('No-op placement, selection and runtime feedback leave document and ratline work untouched', async () => {
    await tick(); const before = pcb.getState(), calls = computations, fp = before.footprints[0]
    pcb.getState().updateFootprintPosition(fp.id, fp.x, fp.y, fp.rotation); assert.equal(pcb.getState(), before)
    pcb.getState().selectFootprint(fp.id); canvas.getState().updateRuntimeNode('n0', { properties: { isLit: true } }); await tick()
    assert.equal(pcb.getState().footprints, before.footprints); assert.equal(pcb.getState().ratlines, before.ratlines)
    assert.equal(pcb.getState().localDocumentRevision, before.localDocumentRevision); assert.equal(computations, calls)
  })
  await check('Geometry projection preserves full-engine output across deterministic multi-net changes', () => {
    const small = nodes.slice(0, 20), session = new PcbSchematicSync(); let current = { footprints: [] }
    for (let i = 0; i < 30; i++) {
      const links = Array.from({ length: 14 }, (_, j) => wire('w' + j, 'n' + ((j + i) % 18), 'n' + ((j * 7 + i + 1) % 18), j % 2 ? 'p1' : 'p2'))
      current = session.reconcile(small, links, current.footprints.map((fp, j) => ({ ...fp, x: j * 3 + i, rotation: (j % 4) * 90 })), [])
      equivalent(small, links, current)
    }
  })
} catch (error) { failure = error; checks.push({ name: 'Contract failure', passed: false, error: error.stack }) }
finally {
  unsubscribe?.(); disconnect?.(); if (engine && compute) engine.computeRatlines = compute
  await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-025-pcb-sync-contract-tests.json', import.meta.url), JSON.stringify({ task: 'VFOPT-UI-025', capturedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', checks }, null, 2) + '\n')
}
if (failure) throw failure
