import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const check = (name, fn) => { fn(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
let failure
try {
  const { PcbSceneGeometry, PcbVisibilityWindow, pcbViewportBounds, intersectsPcbViewport: intersects, pcbPoints } = await server.ssrLoadModule('/src/features/pcb/pcbSceneGeometry.ts')
  const { PcbRasterBudget } = await server.ssrLoadModule('/src/features/pcb/pcbRasterBudget.ts')
  const geometry = new PcbSceneGeometry(), fp = { id: 'fp', componentId: 'n', name: 'A long reference\nwith two lines', x: 20, y: 30, width: 5, height: 4, rotation: 0,
    pads: [{ id: 'p', name: 'long pad label', x: -10, y: 8, width: 1, height: 2, drillDiameter: 3 }] }
  const contains = (b, x, y) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom
  check('Viewport inversion retains a constant 64 screen-pixel overscan at all supported zooms', () => {
    for (const scale of [.2, .5, 1, 2.5, 3]) {
      const b = pcbViewportBounds({ x: -600, y: 350, scale }, 1200, 740)
      assert.equal(b.left * scale - 600, -64); assert.equal(b.right * scale - 600, 1264)
      assert(Math.abs(b.top * scale + 350 + 64) < 1e-9); assert.equal(b.bottom * scale + 350, 804)
    }
  })
  check('Closed viewport edges, negative coordinates and crossing segments are never culled by endpoint-only logic', () => {
    const view = { left: 0, top: 0, right: 100, bottom: 100 }
    assert(intersects({ left: -20, top: 20, right: 0, bottom: 50 }, view))
    assert(!intersects({ left: -20, top: 20, right: -1, bottom: 50 }, view))
    const t = { points: [{ x: -100, y: 0 }, { x: 100, y: 0 }], width_mm: .25 }
    assert(intersects(geometry.trace(t).bounds, view))
    assert(intersects(geometry.ratline({ from: t.points[0], to: t.points[1] }).bounds, view))
  })
  check('Viewport hysteresis reuses edge objects but evicts beyond the retention margin and on document removal', () => {
    const window = new PcbVisibilityWindow(), a = { id: 'a', left: 90, top: 0, right: 100, bottom: 10 }, far = { ...a, id: 'far', left: 1000, right: 1010 }
    const enter = { left: 0, top: 0, right: 100, bottom: 100 }, retain = { ...enter, right: 300 }
    assert.deepEqual(window.select([a, far], enter, retain, v => v), [a])
    const shifted = { ...a, left: 200, right: 210 }
    assert.deepEqual(window.select([shifted, far], enter, retain, v => v), [shifted])
    assert.deepEqual(window.select([{ ...a, left: 301, right: 310 }, far], enter, retain, v => v), [])
    assert.deepEqual(window.select([a, far], enter, retain, v => v, v => v.id === 'far'), [a, far])
    assert.deepEqual(window.select([], enter, retain, v => v), [])
    assert.deepEqual(window.select([shifted], enter, retain, v => v), [])
  })
  check('Rotated bounds retain external pads, oversized drills and reference/pad text overhang', () => {
    for (const rotation of [0, 30, 90, 180, 270, -45]) {
      const b = geometry.footprint({ ...fp, rotation }), r = rotation * Math.PI / 180
      for (const [x, y] of [[-47, 32], [-40, 32], [0, -20], [150, -20], [-40, 125], [10, 8]]) {
        assert(contains(b, 120 + x * Math.cos(r) - y * Math.sin(r), 160 + x * Math.sin(r) + y * Math.cos(r)))
      }
    }
  })
  check('Copper stroke, shadow and via drill extents stay visible across the viewport edge', () => {
    const b = geometry.trace({ points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], width_mm: 2 })
    assert(contains(b.bounds, 80, 62)); assert(contains(b.bounds, 120, 98))
    const via = geometry.via({ x: -10, y: -10, pad_mm: .6, drill_mm: 2 })
    assert(contains(via, -17, 0)); assert(contains(via, 17, 0))
  })
  check('Immutable geometry reuses bounds and point arrays; replacement objects invalidate them without mutating source', () => {
    const saved = structuredClone(fp), t = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width_mm: .2 }
    assert.equal(geometry.footprint(fp), geometry.footprint(fp)); assert.equal(geometry.trace(t), geometry.trace(t))
    assert.notEqual(geometry.footprint({ ...fp, x: 100 }), geometry.footprint(fp))
    assert.notEqual(geometry.trace({ ...t, points: [{ x: 5, y: 5 }] }).points, geometry.trace(t).points)
    assert.deepEqual(fp, saved); assert.deepEqual(pcbPoints(t.points), [40, 40, 44, 44])
  })
  check('Invalid geometry and invalid viewport fail open, including an empty trace', () => {
    const far = { left: 1e8, top: 1e8, right: 1e9, bottom: 1e9 }
    assert(intersects(geometry.footprint({ ...fp, rotation: NaN }), far))
    assert(intersects(geometry.trace({ points: [], width_mm: 1 }).bounds, far))
    assert(intersects(geometry.via({ x: Infinity, y: 0, pad_mm: 1, drill_mm: 1 }), far))
    assert(intersects(far, pcbViewportBounds({ x: 0, y: 0, scale: 0 }, 1200, 740)))
  })
  check('Raster allocation has per-part and per-scene caps with idempotent cleanup and vector fallback', () => {
    const budget = new PcbRasterBudget(1024), release = budget.reserve(700)
    assert(release); assert.equal(budget.reserve(400), undefined); release(); release()
    assert(budget.reserve(1024)); assert.equal(budget.reserve(1), undefined)
    const large = new PcbRasterBudget(); assert.equal(large.reserve(256 * 1024 + 1), undefined)
    for (const value of [NaN, Infinity, 0, -1]) assert.equal(large.reserve(value), undefined)
  })
} catch (e) { failure = e; checks.push({ name: 'Contract failure', passed: false, error: e.stack }) }
finally {
  await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-027-scene-contract-tests.json', import.meta.url), JSON.stringify({ task: 'VFOPT-UI-027', capturedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', checks }, null, 2) + '\n')
}
if (failure) throw failure
