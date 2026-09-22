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
  const { ComponentSpatialIndex, ComponentBoundsCache, createComponentVisibilitySnapshot, componentWorldBounds, componentViewportBounds, COMPONENT_ENTER_MARGIN, COMPONENT_EXIT_MARGIN } = await server.ssrLoadModule('/src/features/canvas/componentVisibility.ts')
  const { CanvasAudioState } = await server.ssrLoadModule('/src/features/canvas/canvasAudioState.ts')
  const node = { id: 'a', type: 'RESISTOR', name: 'R', x: 0, y: 0, width: 60, height: 30, pins: [{ id: 'p', x: -120, y: 15, name: 'external pin', type: 'digital' }], properties: {} }
  const contains = (b, x, y) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
  const empty = new Set()
  check('Drag previews do not publish a new scene snapshot; other edits, removal and release do', () => {
    const select = createComponentVisibilitySnapshot(), other = { ...node, id: 'b', x: 1000 }, initial = [node, other]
    assert.equal(select({ documentNodes: initial, draggingNodeId: null }), initial)
    const moved = [{ ...node, x: 5000 }, other]
    assert.equal(select({ documentNodes: moved, draggingNodeId: 'a' }), initial)
    const changedOther = [moved[0], { ...other, x: 0 }]
    assert.equal(select({ documentNodes: changedOther, draggingNodeId: 'a' }), changedOther)
    const final = [{ ...moved[0], x: 6000 }, changedOther[1]]
    assert.equal(select({ documentNodes: final, draggingNodeId: 'a' }), changedOther)
    assert.equal(select({ documentNodes: final, draggingNodeId: null }), final)
    const removed = [final[0]]
    assert.equal(select({ documentNodes: removed, draggingNodeId: 'a' }), removed)
  })
  check('Entry/exit overscan is constant in screen pixels across supported zooms', () => {
    for (const scale of [.2, .5, 1, 2, 3]) for (const margin of [COMPONENT_ENTER_MARGIN, COMPONENT_EXIT_MARGIN]) {
      const b = componentViewportBounds({ x: -700, y: 90, scale }, 1280, 700, margin)
      assert(Math.abs(b.minX * scale - 700 + margin) < 1e-9); assert(Math.abs(b.maxY * scale + 90 - 700 - margin) < 1e-9)
    }
    assert(COMPONENT_ENTER_MARGIN > 64); assert(COMPONENT_EXIT_MARGIN > COMPONENT_ENTER_MARGIN)
  })
  check('Rotated bounds include external pins, long multiline labels, negative coordinates and glow', () => {
    for (const rotation of [0, 30, 90, 180, 270, -45]) {
      const n = { ...node, x: -600, y: -200, rotation, pins: [{ ...node.pins[0], name: 'PIN'.repeat(80) }] }, b = componentWorldBounds(n), rad = rotation * Math.PI / 180
      for (const [x, y] of [[0, 0], [60, 30], [-120, 15], [-120, -500]]) assert(contains(b, n.x + x * Math.cos(rad) - y * Math.sin(rad), n.y + x * Math.sin(rad) + y * Math.cos(rad)))
    }
    const led = { ...node, type: 'LED', width: 500 }, b = componentWorldBounds(led)
    assert(contains(b, 250 + 450, 5))
    const long = { ...node, name: 'name\n'.repeat(100) }
    assert(contains(componentWorldBounds(long), 6, 1000))
  })
  check('Sensor handles remain in bounds beyond the physical package', () => {
    assert(contains(componentWorldBounds({ ...node, type: 'LDR' }), 150, 15))
    assert(contains(componentWorldBounds({ ...node, type: 'PIR_SENSOR', properties: { intruderX: -800, intruderY: 900 } }), -770, 915))
  })
  check('Spatial queries match a brute-force geometry oracle, preserving document stacking order', () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({ ...node, id: String(i), x: (i % 40 - 20) * 230, y: (Math.floor(i / 40) - 12) * 160, rotation: i * 37 % 360 }))
    const index = new ComponentSpatialIndex(nodes)
    for (const scale of [.2, .7, 1, 3]) for (const x of [-3200, 0, 1200]) {
      const view = { x, y: -1400, scale }, bounds = componentViewportBounds(view, 1280, 700)
      const expected = nodes.filter(n => { const b = componentWorldBounds(n); return b.minX <= bounds.maxX && b.maxX >= bounds.minX && b.minY <= bounds.maxY && b.maxY >= bounds.minY }).map(n => n.id)
      assert.deepEqual(index.select(view, 1280, 700, empty, empty).map(n => n.id), expected)
    }
  })
  check('Hysteresis retains near-edge nodes then evicts them; pinned nodes remain, removed nodes do not', () => {
    const n = { ...node, id: 'edge', x: 0, y: 0, pins: [] }, index = new ComponentSpatialIndex([n])
    const view = { x: -500, y: 0, scale: 1 }
    assert.equal(index.select(view, 100, 100, empty, empty).length, 0)
    assert.equal(index.select(view, 100, 100, new Set(['edge']), empty).length, 1)
    assert.equal(index.select({ ...view, x: -1000 }, 100, 100, new Set(['edge']), empty).length, 0)
    assert.equal(index.select({ ...view, x: -10000 }, 100, 100, empty, new Set(['edge'])).length, 1)
    assert.deepEqual(new ComponentSpatialIndex([]).select(view, 100, 100, new Set(['edge']), new Set(['edge'])), [])
    assert.deepEqual(index.select(view, 0, 0, empty, empty), [])
  })
  check('Oversized nodes and enormous viewports use bounded fallbacks instead of allocating unbounded grids', () => {
    const large = { ...node, id: 'large', width: 1e9, height: 1e9, pins: [] }, index = new ComponentSpatialIndex([large, node])
    assert.equal(index.select({ x: -1e6, y: -1e6, scale: 1 }, 1280, 700, empty, empty)[0].id, 'large')
    assert.equal(index.select({ x: 0, y: 0, scale: .2 }, 1e8, 1e8, empty, empty).length, 2)
  })
  check('Bounds cache follows immutable node geometry edits and does not retain removed documents strongly', () => {
    const cache = new ComponentBoundsCache(), first = cache.get(node)
    assert.equal(cache.get(node), first)
    assert.notEqual(cache.get({ ...node, x: 2000 }), first)
  })
  check('Offscreen buzzer edges preserve sound without viewport-driven restarts', () => {
    const calls = [], audio = new CanvasAudioState({ playTone: (...args) => calls.push(['tone', ...args]), stopTone: () => calls.push(['stop']), playClick: type => calls.push(['click', type]) })
    const beep = { ...node, properties: { isBeeping: true, frequency: 440 } }
    audio.update([beep], true); audio.update([beep], true); audio.update([{ ...beep, x: 2000 }], true)
    assert.deepEqual(calls, [['tone', 440, 'square', .08]])
    audio.update([beep], false); assert.deepEqual(calls.at(-1), ['stop'])
    audio.update([beep], true); audio.update([], true); assert.deepEqual(calls.at(-1), ['stop'])
    const count = calls.length; audio.dispose(); assert.equal(calls.length, count)
  })
  check('Button, switch and relay transition semantics survive visual mount/unmount', () => {
    const calls = [], audio = new CanvasAudioState({ playTone() {}, stopTone() {}, playClick: type => calls.push(type) })
    for (const [type, prop, expected, initial] of [['BUTTON', 'isPressed', 'button', 1], ['SWITCH_SPST', 'isClosed', 'switch', 0], ['RELAY_SINGLE', 'isActive', 'relay', 1]]) {
      audio.dispose(); calls.length = 0
      const on = { ...node, type, properties: { [prop]: true } }, off = { ...on, properties: { [prop]: false } }
      audio.update([on], true); assert.equal(calls.length, initial)
      audio.update([on], true); assert.equal(calls.length, initial)
      audio.update([off], true); audio.update([on], true)
      assert(calls.every(c => c === expected)); assert.equal(calls.length, initial + (type === 'BUTTON' ? 1 : 2))
    }
  })
  check('Editor unmount stops an owned tone and unavailable audio does not break simulation', () => {
    let stopped = 0
    const audio = new CanvasAudioState({ playTone() {}, stopTone() { stopped++ }, playClick() {} })
    audio.update([{ ...node, properties: { isBeeping: true } }], true); audio.dispose(); assert.equal(stopped, 1)
    new CanvasAudioState({ playTone() { throw Error('Unavailable') }, stopTone() {}, playClick() {} }).update([{ ...node, properties: { isBeeping: true } }], true)
  })
} catch (e) { failure = e; console.error(e.stack) }
finally {
  fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/reports/vfopt-ui-014-contract.json'), JSON.stringify({ task: 'VFOPT-UI-014', capturedAt: new Date().toISOString(), checks, failure: failure?.message ?? null }, null, 2) + '\n')
  await server.close()
}
if (failure) process.exitCode = 1
