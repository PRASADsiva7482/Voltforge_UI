import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
})

try {
  const catalog = await vite.ssrLoadModule('/src/features/canvas/boardCatalog.ts')
  const geometry = await vite.ssrLoadModule('/src/features/canvas/boardGeometry.ts')
  const registry = await vite.ssrLoadModule('/src/features/canvas/pinRegistry.ts')
  const factory = await vite.ssrLoadModule('/src/features/canvas/componentFactory.ts')

  const exactTypes = [
    'ARDUINO_UNO',
    'ARDUINO_UNO_R4',
    'ARDUINO_MEGA',
    'ARDUINO_NANO_EVERY',
    'ARDUINO_LEONARDO',
    'ARDUINO_MICRO',
    'RASPBERRY_PI_PICO',
    'RASPBERRY_PI_PICO_2',
  ]

  assert.equal(geometry.BOARD_GEOMETRY_FIXTURE_DOCUMENT.schemaVersion, 1)
  assert.equal(geometry.BOARD_GEOMETRY_FIXTURE_DOCUMENT.artworkMechanicallyVerified, false)
  assert.deepEqual([...geometry.VERIFIED_BOARD_GEOMETRY_FIXTURES.keys()], exactTypes)
  assert.equal(
    geometry.BOARD_GEOMETRY_FIXTURE_DOCUMENT.fixtures
      .flatMap((fixture) => fixture.connectors)
      .flatMap((connector) => connector.pins).length,
    328,
  )

  for (const boardType of exactTypes) {
    const board = catalog.getBoardProfile(boardType)
    const fixture = geometry.VERIFIED_BOARD_GEOMETRY_FIXTURES.get(boardType)
    assert.ok(board)
    assert.ok(fixture)
    assert.equal(board.geometry.pinoutStatus, 'manufacturer-verified')
    assert.equal(board.geometry.artworkStatus, 'documented-limitation')
    assert.equal(board.geometry.geometryRevision, fixture.geometryRevision)
    assert.match(fixture.source.uri, /^https:\/\/(docs\.arduino\.cc|datasheets\.raspberrypi\.com)\//)
    assert.deepEqual(fixture.canvasDimensions, catalog.BOARD_FOOTPRINT_DIMENSIONS[board.footprint])

    const expectedIds = fixture.connectors.flatMap((connector) => connector.pins.map((pin) => pin.id))
    const pins = registry.getPinsForComponent(boardType)
    assert.deepEqual(pins.map((pin) => pin.id), expectedIds)
    assert.equal(new Set(expectedIds).size, expectedIds.length)

    const pinsById = new Map(pins.map((pin) => [pin.id, pin]))
    for (const connector of fixture.connectors) {
      const positions = connector.pins.map((pin) => {
        const rendered = pinsById.get(pin.id)
        assert.ok(rendered)
        assert.equal(rendered.name, pin.name)
        assert.equal(rendered.type, pin.type)
        assert.ok(rendered.x >= 0 && rendered.x <= fixture.canvasDimensions.w)
        assert.ok(rendered.y >= 0 && rendered.y <= fixture.canvasDimensions.h)
        return connector.edge === 'left' || connector.edge === 'right' ? rendered.y : rendered.x
      })
      assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]))
    }
  }

  const leonardo = catalog.getBoardProfile('ARDUINO_LEONARDO')
  const micro = catalog.getBoardProfile('ARDUINO_MICRO')
  assert.equal(leonardo.footprint, 'uno')
  assert.equal(micro.footprint, 'nano')
  assert.notDeepEqual(
    registry.getPinsForComponent('ARDUINO_LEONARDO').map((pin) => pin.name),
    registry.getPinsForComponent('ARDUINO_UNO').map((pin) => pin.name),
  )
  assert.notDeepEqual(
    registry.getPinsForComponent('ARDUINO_MICRO').map((pin) => pin.id),
    registry.getPinsForComponent('ARDUINO_NANO').map((pin) => pin.id),
  )

  assert.equal(catalog.getBoardProfile('ESP32').geometry.pinoutStatus, 'shared-footprint')
  assert.equal(registry.getPinsForComponent('ARDUINO_NANO_EVERY').length, 30)
  assert.ok(registry.getPinsForComponent('ARDUINO_NANO_EVERY').some((pin) => pin.id === '3v3'))
  assert.equal(catalog.getBoardPinNumber({ id: 'd3', name: 'D3/SCL' }), '3')
  assert.equal(catalog.getBoardLogicVoltage('ARDUINO_LEONARDO'), 5)
  assert.equal(catalog.getBoardPowerVoltage('RASPBERRY_PI_PICO_2', { id: 'vsys', name: 'VSYS' }), null)

  const legacyMicroPins = [
    { id: 'a6', name: 'A6', type: 'input', x: 100, y: 140 },
    { id: 'a7', name: 'A7', type: 'input', x: 100, y: 150 },
  ]
  const hydratedLegacyMicro = factory.hydrateCanvasNode({
    height: 160,
    id: 'saved-micro',
    name: 'Saved Arduino Micro',
    pins: legacyMicroPins,
    type: 'ARDUINO_MICRO',
    width: 100,
    x: 10,
    y: 20,
  })
  assert.deepEqual(hydratedLegacyMicro.pins, legacyMicroPins)

  assert.equal(geometry.boardGeometryStatusLabel('manufacturer-verified'), 'Pins verified')
  assert.equal(geometry.boardGeometryStatusLabel('shared-footprint'), 'Shared pin layout')
  assert.equal(geometry.boardGeometryStatusClass('manufacturer-verified'), 'is-pinout-verified')
  assert.match(geometry.boardGeometryTooltip(leonardo.geometry), /not a scale-verified Leonardo drawing/)

  console.log('Board geometry and saved-project compatibility contract passed')
} finally {
  await vite.close()
}
