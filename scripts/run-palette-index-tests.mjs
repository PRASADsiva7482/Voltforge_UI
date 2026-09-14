import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), checks = []
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const check = (name, action) => { action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
try {
  const { buildPaletteIndex, filterPaletteIndex, getPalettePage, normalizePaletteSearch, PALETTE_PAGE_SIZE } = await server.ssrLoadModule('/src/features/editor/componentPalette.ts')
  const component = (id, category, name = id, sortOrder = 1) => ({ id, type: id, name, category, sortOrder, description: 'Independent description', defaultProperties: {}, isPremium: false, createdAt: '' })
  check('Canonical category and per-category ordering is stable without mutating source data', () => {
    const source = [component('zz', 'EXTENSION'), component('led2', 'LED', 'B'), component('led1', 'LED', 'A'), component('r', 'PASSIVE'), component('b', 'BOARD'), component('aa', '__proto__')]
    source.forEach(Object.freeze); Object.freeze(source)
    const index = buildPaletteIndex(source)
    assert.deepEqual(index.map(entry => entry.component.id), ['b', 'r', 'led1', 'led2', 'aa', 'zz'])
    assert.equal(source[0].id, 'zz'); assert.equal(index[0].component, source[4])
  })
  check('All 1000 items remain reachable once with bounded pages including unknown categories', () => {
    const source = Array.from({ length: 1000 }, (_, i) => component('custom_' + i, 'category_' + i))
    const index = buildPaletteIndex(source), seen = []
    for (let i=0; i<25; i++) {
      const page = getPalettePage(index, i), items = [...page.groups.values()].flat()
      assert(items.length <= PALETTE_PAGE_SIZE); assert(page.groups.size <= PALETTE_PAGE_SIZE)
      seen.push(...items.map(component => component.id))
    }
    assert.deepEqual(seen.sort(), source.map(component => component.id).sort()); assert.equal(new Set(seen).size, 1000)
  })
  check('Empty, last and shrinking pages have valid bounds', () => {
    const index = buildPaletteIndex(Array.from({ length: 41 }, (_, i) => component('part_' + i, 'SENSOR')))
    assert.equal(getPalettePage(index, 999).page, 1); assert.equal(getPalettePage(index, 999).end, 41)
    assert.equal(getPalettePage(index, -3).page, 0); assert.equal(getPalettePage(index, NaN).page, 0)
    const empty = getPalettePage([], 3); assert.equal(empty.page, 0); assert.equal(empty.end, 0); assert.equal(empty.groups.size, 0)
  })
  check('Normalized name, type and description search is global and catalogue updates are reflected', () => {
    const resistor = component('CUSTOM_RESISTOR', 'PASSIVE', 'Resistor module')
    const sensor = component('CUSTOM_SENSOR', 'SENSOR', 'Sensor module')
    const index = buildPaletteIndex([resistor, sensor])
    assert.equal(filterPaletteIndex(index, ''), index)
    assert.deepEqual(filterPaletteIndex(index, '', 'SENSOR').map(entry => entry.component), [sensor])
    for (const search of ['  RESISTOR MODULE  ', 'custom_resistor', 'custom resistor']) assert.deepEqual(filterPaletteIndex(index, normalizePaletteSearch(search), 'SENSOR').map(entry => entry.component), [resistor])
    assert.equal(filterPaletteIndex(index, 'independent description').length, 2)
    const updated = buildPaletteIndex([{ ...resistor, description: 'Replacement token' }])
    assert.equal(filterPaletteIndex(updated, 'replacement token').length, 1)
    assert.equal(filterPaletteIndex(updated, 'independent description').length, 0)
  })
} finally {
  await server.close()
  fs.writeFileSync(new URL('../docs/reports/vfopt-ui-012-palette-index-tests.json', import.meta.url), JSON.stringify({ task: 'VFOPT-UI-012', capturedAt: new Date().toISOString(), status: checks.length === 4 ? 'passed' : 'failed', checks }, null, 2) + '\n')
}
