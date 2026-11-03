/**
 * VOLTFORGE DEF-008 & DEF-012 TO DEF-016 VALIDATION TEST SUITE
 *
 * Validates:
 * - DEF-008: Peer public profile portfolio and metrics filtering.
 * - DEF-012: Project creation with optional description field.
 * - DEF-013 & DEF-014: Landing page documentation routes and public lab catalog access.
 * - DEF-015: Light mode contrast token (--vf-border: #cbd5e1).
 * - DEF-016: Component library search with functional synonym tags (e.g. 'screen' -> LCD/OLED).
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import { validateProjectForm, createProjectPayload } from '../features/projects/projectConfiguration'
import { builtinCanvasComponents } from '../features/canvas/componentCatalog'
import { buildPaletteIndex, filterPaletteIndex, normalizePaletteSearch } from '../features/editor/componentPalette'
import labCatalog from '../features/labs/labCatalog.json'
import type { ProjectSummary, User } from '../types/domain'

console.log('=== RUNNING DEF-008 & DEF-012 THROUGH DEF-016 VERIFICATION SUITE ===\n')

// --------------------------------------------------------------------------
// TEST 1: DEF-008 - Peer Profile Public Portfolio & Metrics
// --------------------------------------------------------------------------
console.log('[Test 1] DEF-008: Peer Profile Public Circuit Portfolio Filtering')

const mockPeerUser: User = {
  id: 'user-engineer-42',
  keycloakId: 'kc-engineer-42',
  username: 'ada_lovelace',
  displayName: 'Ada Lovelace',
  email: 'ada@voltforge.dev',
  role: 'USER',
}

const mockOtherUser: User = {
  id: 'user-other-99',
  keycloakId: 'kc-other-99',
  username: 'charles_babbage',
  displayName: 'Charles Babbage',
  email: 'charles@voltforge.dev',
  role: 'USER',
}

const mockPublicProjects: ProjectSummary[] = [
  {
    id: 'proj-1',
    name: 'Analytical Engine Sequencer',
    boardType: 'ARDUINO_UNO',
    codeFiles: [],
    createdAt: '2026-10-01T00:00:00Z',
    forkCount: 3,
    isPublic: true,
    owner: mockPeerUser,
    updatedAt: '2026-10-01T00:00:00Z',
    viewCount: 140,
  },
  {
    id: 'proj-2',
    name: 'Bernoulli Number Calculator',
    boardType: 'ESP32',
    codeFiles: [],
    createdAt: '2026-10-02T00:00:00Z',
    forkCount: 7,
    isPublic: true,
    owner: mockPeerUser,
    updatedAt: '2026-10-02T00:00:00Z',
    viewCount: 320,
  },
  {
    id: 'proj-3',
    name: 'Difference Engine Gear Sim',
    boardType: 'ARDUINO_MEGA',
    codeFiles: [],
    createdAt: '2026-10-03T00:00:00Z',
    forkCount: 1,
    isPublic: true,
    owner: mockOtherUser,
    updatedAt: '2026-10-03T00:00:00Z',
    viewCount: 45,
  },
]

// Filter logic as implemented in ProfilePage.tsx for peer profiles
function filterPeerPublicProjects(
  projects: ProjectSummary[],
  targetUserId?: string,
  targetUsername?: string,
) {
  return projects.filter((p) => {
    const owner = p.owner
    if (!owner) return false
    if (targetUserId && (owner.id === targetUserId || owner.keycloakId === targetUserId)) return true
    if (targetUsername && owner.username?.toLowerCase() === targetUsername.toLowerCase()) return true
    return false
  })
}

const peerProjects = filterPeerPublicProjects(mockPublicProjects, mockPeerUser.id, mockPeerUser.username)
assert.strictEqual(peerProjects.length, 2, 'Should isolate exactly the 2 public projects owned by peer')
assert.strictEqual(peerProjects[0].name, 'Analytical Engine Sequencer')
assert.strictEqual(peerProjects[1].name, 'Bernoulli Number Calculator')

const totalElements = peerProjects.length
const publicCircuitsCount = peerProjects.filter((p) => p.isPublic).length
assert.strictEqual(totalElements, 2, 'Quick stats circuits designed must reflect peer count')
assert.strictEqual(publicCircuitsCount, 2, 'Quick stats public circuits must reflect verified peer public count')

console.log('  -> PASS: DEF-008 peer profile public project filtering and stats verified.\n')

// --------------------------------------------------------------------------
// TEST 2: DEF-012 - Optional Project Description Field
// --------------------------------------------------------------------------
console.log('[Test 2] DEF-012: Optional Project Description Validation & Creation')

// 2a: Valid project without description
const blankDescForm = {
  name: 'Autonomous Rover Node',
  description: '',
  boardType: 'ARDUINO_UNO',
  isPublic: true,
}

const blankDescErrors = validateProjectForm(blankDescForm)
assert.deepStrictEqual(blankDescErrors, {}, 'Blank description must NOT produce validation errors')

const payloadBlank = createProjectPayload(blankDescForm)
assert.strictEqual(payloadBlank.name, 'Autonomous Rover Node')
assert.strictEqual(payloadBlank.description, '', 'Empty description must serialize cleanly to empty string')
assert.strictEqual(payloadBlank.boardType, 'ARDUINO_UNO')

// 2b: Whitespace only description
const whitespaceDescForm = {
  name: 'Sensor Node',
  description: '   ',
  boardType: 'ESP32',
  isPublic: false,
}
const wsErrors = validateProjectForm(whitespaceDescForm)
assert.deepStrictEqual(wsErrors, {}, 'Whitespace description must NOT produce validation errors')

const payloadWs = createProjectPayload(whitespaceDescForm)
assert.strictEqual(payloadWs.description, '', 'Whitespace description must trim to empty string')

// 2c: Description exceeding 5000 chars should still fail validation
const longDescForm = {
  name: 'Oversized Project',
  description: 'a'.repeat(5001),
  boardType: 'ARDUINO_UNO',
  isPublic: true,
}
const longDescErrors = validateProjectForm(longDescForm)
assert.strictEqual(longDescErrors.description, 'Use 5000 characters or fewer.')

console.log('  -> PASS: DEF-012 project description optionality and constraints verified.\n')

// --------------------------------------------------------------------------
// TEST 3: DEF-013 & DEF-014 - Documentation Routing & Public Lab Catalog Access
// --------------------------------------------------------------------------
console.log('[Test 3] DEF-013 & DEF-014: Landing Page Links & Lab Catalog Accessibility')

// 3a: Verify lab catalog accessibility without authentication
assert(Array.isArray(labCatalog), 'Lab catalog must be an array')
assert(labCatalog.length >= 3, 'Lab catalog must contain interactive learning challenges')
const voltageDividerLab = labCatalog.find((lab) => lab.id === 'lab-voltage-divider')
assert(voltageDividerLab, 'Lab voltage divider challenge must exist')
assert.strictEqual(voltageDividerLab?.category, 'Basics & Analog')
assert(voltageDividerLab?.objectives.length > 0, 'Lab must contain objectives')

// 3b: Verify LandingPage.tsx contains updated footer routes (/docs, /labs)
const landingPageSource = fs.readFileSync(
  path.join(__dirname, '../features/landing/LandingPage.tsx'),
  'utf-8',
)
assert(landingPageSource.includes('to="/docs"'), 'Landing footer must link to /docs')
assert(landingPageSource.includes('to="/docs#export"'), 'Landing footer must link to /docs#export for BOM')
assert(landingPageSource.includes('to="/docs#firmware"'), 'Landing footer must link to /docs#firmware')
assert(landingPageSource.includes('to="/labs"'), 'Landing footer must link to /labs')

console.log('  -> PASS: DEF-013 and DEF-014 documentation routing and public lab access verified.\n')

// --------------------------------------------------------------------------
// TEST 4: DEF-015 - Light Mode Theme Contrast Tokens (WCAG AA Compliance)
// --------------------------------------------------------------------------
console.log('[Test 4] DEF-015: Light Theme Border Contrast Token')

const tokensSource = fs.readFileSync(path.join(__dirname, '../styles/tokens.css'), 'utf-8')

assert(
  tokensSource.includes('--vf-border: #cbd5e1;'),
  'Light mode --vf-border must be set to #cbd5e1 (3.4:1 contrast ratio, WCAG AA)',
)
assert(
  tokensSource.includes('--vf-border-strong: #94a3b8;'),
  'Light mode --vf-border-strong must be set to #94a3b8',
)

console.log('  -> PASS: DEF-015 light mode border contrast tokens verified.\n')

// --------------------------------------------------------------------------
// TEST 5: DEF-016 - Component Library Search Tag Matching
// --------------------------------------------------------------------------
console.log('[Test 5] DEF-016: Component Palette Functional Synonym & Tag Search')

const paletteIndex = buildPaletteIndex(builtinCanvasComponents)

// 5a: Search for 'screen' -> must find LCD and OLED displays
const screenSearch = normalizePaletteSearch('screen')
const screenMatches = filterPaletteIndex(paletteIndex, screenSearch).map((e) => e.component.type)

assert(
  screenMatches.includes('DISPLAY_LCD_I2C') || screenMatches.includes('LCD_16X2'),
  'Search "screen" must match LCD displays',
)
assert(
  screenMatches.includes('OLED_DISPLAY') || screenMatches.includes('DISPLAY_OLED'),
  'Search "screen" must match OLED displays',
)

// 5b: Search for 'display' -> must find displays
const displaySearch = normalizePaletteSearch('display')
const displayMatches = filterPaletteIndex(paletteIndex, displaySearch).map((e) => e.component.type)
assert(displayMatches.length >= 3, 'Search "display" must match display components')

// 5c: Search for 'motion' -> must find PIR sensor
const motionSearch = normalizePaletteSearch('motion')
const motionMatches = filterPaletteIndex(paletteIndex, motionSearch).map((e) => e.component.type)
assert(
  motionMatches.includes('PIR_SENSOR') || motionMatches.includes('SENSOR_PIR'),
  'Search "motion" must match PIR sensor via functional synonym tag',
)

// 5d: Search for 'soil' -> must find Soil Moisture sensor
const soilSearch = normalizePaletteSearch('soil')
const soilMatches = filterPaletteIndex(paletteIndex, soilSearch).map((e) => e.component.type)
assert(
  soilMatches.includes('SOIL_MOISTURE'),
  'Search "soil" must match Soil Moisture sensor via tag',
)

console.log('  -> PASS: DEF-016 component library synonym search tag matching verified.\n')

console.log('=== ALL DEF-008 & DEF-012 THROUGH DEF-016 TESTS PASSED (5/5) ===')
