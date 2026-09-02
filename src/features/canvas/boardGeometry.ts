import type { BoardType, PinPosition } from '../../types/domain'
import rawFixtures from './boardGeometryFixtures.v1.json'

type FixturePin = Omit<PinPosition, 'x' | 'y'>

export type BoardConnectorFixture = {
  edge: 'bottom' | 'left' | 'right' | 'top'
  id: string
  inset?: number
  pins: FixturePin[]
}

export type BoardGeometryFixture = {
  artworkLimitation: string
  artworkStatus: 'documented-limitation'
  boardType: BoardType
  canvasDimensions: { h: number; w: number }
  connectors: BoardConnectorFixture[]
  geometryRevision: string
  legacyFallbackPinIds: string[]
  pinoutStatus: 'manufacturer-verified'
  recordId: string
  representedScope: string
  source: {
    documentRevision: string
    publisher: string
    title: string
    uri: string
  }
  unrepresentedConnectors: string[]
}

type BoardGeometryFixtureDocument = {
  artworkMechanicallyVerified: false
  asOfDate: string
  fixtureVersion: string
  fixtures: BoardGeometryFixture[]
  schemaVersion: 1
}

export type BoardGeometryMetadata = {
  artworkLimitation: string
  artworkStatus: 'documented-limitation'
  geometryRevision: string
  pinoutStatus: 'manufacturer-verified' | 'shared-footprint'
  representedScope: string
  source?: BoardGeometryFixture['source']
  unrepresentedConnectors: string[]
}

export const BOARD_GEOMETRY_FIXTURE_DOCUMENT = rawFixtures as BoardGeometryFixtureDocument

export const VERIFIED_BOARD_GEOMETRY_FIXTURES = new Map<BoardType, BoardGeometryFixture>(
  BOARD_GEOMETRY_FIXTURE_DOCUMENT.fixtures.map((fixture) => [fixture.boardType, fixture]),
)

function edgeCoordinate(
  connector: BoardConnectorFixture,
  index: number,
  dimensions: { h: number; w: number },
): { x: number; y: number } {
  const vertical = connector.edge === 'left' || connector.edge === 'right'
  const span = vertical ? dimensions.h : dimensions.w
  const margin = Math.min(10, span * 0.07)
  const position = connector.pins.length === 1
    ? span / 2
    : margin + index * ((span - margin * 2) / (connector.pins.length - 1))
  const inset = connector.inset ?? 0

  switch (connector.edge) {
    case 'left':
      return { x: inset, y: position }
    case 'right':
      return { x: dimensions.w - inset, y: position }
    case 'top':
      return { x: position, y: inset }
    case 'bottom':
      return { x: position, y: dimensions.h - inset }
  }
}

export function createVerifiedBoardPins(boardType: BoardType): PinPosition[] | undefined {
  const fixture = VERIFIED_BOARD_GEOMETRY_FIXTURES.get(boardType)
  if (!fixture) return undefined

  return fixture.connectors.flatMap((connector) =>
    connector.pins.map((fixturePin, index) => ({
      ...fixturePin,
      ...edgeCoordinate(connector, index, fixture.canvasDimensions),
    })),
  )
}

export function getBoardGeometryMetadata(boardType: BoardType, footprint: string): BoardGeometryMetadata {
  const fixture = VERIFIED_BOARD_GEOMETRY_FIXTURES.get(boardType)
  if (fixture) {
    return {
      artworkLimitation: fixture.artworkLimitation,
      artworkStatus: fixture.artworkStatus,
      geometryRevision: fixture.geometryRevision,
      pinoutStatus: fixture.pinoutStatus,
      representedScope: fixture.representedScope,
      source: fixture.source,
      unrepresentedConnectors: fixture.unrepresentedConnectors,
    }
  }

  return {
    artworkLimitation: `This board currently reuses the generated ${footprint} family profile; its connector order, pitch, outline, and mechanical details are not verified for an exact manufacturer SKU.`,
    artworkStatus: 'documented-limitation',
    geometryRevision: `shared-${footprint}-profile-v1`,
    pinoutStatus: 'shared-footprint',
    representedScope: 'Generic family-level canvas terminals only.',
    unrepresentedConnectors: [],
  }
}

export function boardGeometryStatusLabel(status: BoardGeometryMetadata['pinoutStatus']): string {
  return status === 'manufacturer-verified' ? 'Pins verified' : 'Shared pin layout'
}

export function boardGeometryStatusClass(status: BoardGeometryMetadata['pinoutStatus']): string {
  return status === 'manufacturer-verified' ? 'is-pinout-verified' : 'is-shared-footprint'
}

export function boardGeometryTooltip(geometry: BoardGeometryMetadata): string {
  const source = geometry.source
    ? `${geometry.source.title} (${geometry.source.documentRevision}). `
    : ''
  return `${source}${geometry.representedScope} ${geometry.artworkLimitation}`
}
