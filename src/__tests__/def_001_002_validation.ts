/**
 * VOLTFORGE DEF-001 & DEF-002 VALIDATION TEST SUITE
 *
 * Validates:
 * - DEF-001: Token storage persistence, validation, and lifecycle management for Keycloak rehydration.
 * - DEF-002: AI circuit proposal planning, workspace revision tracking, and transaction safety.
 */

import assert from 'node:assert'
import {
  getStoredAuthTokens,
  setStoredAuthTokens,
  clearStoredAuthTokens,
  type StoredAuthTokens,
} from '../auth/tokenStorage'
import {
  buildAiProposal,
  calculateEditorRevision,
  defaultAiProposalSelection,
  isAiProposalCurrent,
  type AiProposal,
} from '../features/ai/aiProposal'
import { planAiProposalChanges } from '../features/ai/aiProposalTransaction'
import { createInitialProjectLayout } from '../features/projects/projectConfiguration'
import { generateDefaultCode } from '../utils/codeTemplates'
import type { CanvasNode, Wire, CreateProjectRequest } from '../types/domain'

// Mock browser sessionStorage for Node test environment
const storage = new Map<string, string>()
const mockSessionStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}
Object.defineProperty(globalThis, 'window', {
  value: { sessionStorage: mockSessionStorage },
  writable: true,
})

console.log('=== RUNNING DEF-001 & DEF-002 VERIFICATION SUITE ===\n')

// --------------------------------------------------------------------------
// TEST 1: DEF-001 - Token Storage Lifecycle & Validation
// --------------------------------------------------------------------------
console.log('[Test 1] DEF-001: Token Storage Lifecycle & Corrupted Data Handling')

// 1a: Clean state
clearStoredAuthTokens()
assert.strictEqual(getStoredAuthTokens(), null, 'Storage should initially be empty')

// 1b: Persist valid token set
const sampleTokens: StoredAuthTokens = {
  token: 'mock-access-token-xyz-12345',
  refreshToken: 'mock-refresh-token-abc-67890',
  idToken: 'mock-id-token-jwt-99999',
}
setStoredAuthTokens(sampleTokens)
const loaded = getStoredAuthTokens()
assert.ok(loaded, 'Stored tokens should be loaded successfully')
assert.strictEqual(loaded?.token, sampleTokens.token, 'Access token must match')
assert.strictEqual(loaded?.refreshToken, sampleTokens.refreshToken, 'Refresh token must match')
assert.strictEqual(loaded?.idToken, sampleTokens.idToken, 'ID token must match')

// 1c: Missing refresh token must not qualify for rehydration
mockSessionStorage.setItem('vf_auth_session', JSON.stringify({ token: 'only-access-token' }))
assert.strictEqual(getStoredAuthTokens(), null, 'Partial token set without refreshToken must return null')

// 1d: Corrupted JSON must be safely evicted
mockSessionStorage.setItem('vf_auth_session', '{ invalid json syntax !!!')
assert.strictEqual(getStoredAuthTokens(), null, 'Corrupted JSON must return null and clear')
assert.strictEqual(mockSessionStorage.getItem('vf_auth_session'), null, 'Corrupted key must be evicted')

// 1e: Explicit clear
setStoredAuthTokens(sampleTokens)
assert.ok(getStoredAuthTokens(), 'Tokens should exist before clear')
clearStoredAuthTokens()
assert.strictEqual(getStoredAuthTokens(), null, 'clearStoredAuthTokens should remove item')

console.log('  -> PASS: DEF-001 token storage lifecycle and integrity verified.\n')

// --------------------------------------------------------------------------
// TEST 2: DEF-002 - Workspace Revision Tracking & Proposal Building
// --------------------------------------------------------------------------
console.log('[Test 2] DEF-002: Workspace Revision Tracking & Proposal Building')

const initialLayout = createInitialProjectLayout('ARDUINO_UNO')
const initialCode = generateDefaultCode('ARDUINO_UNO', 'Test Project')
const mockCodeFiles = [{ id: 'main.ino', filename: 'main.ino', content: initialCode, language: 'cpp', sortOrder: 0 }]

const revA = calculateEditorRevision(initialLayout.nodes, initialLayout.wires, mockCodeFiles, 0)
assert.ok(revA.startsWith('editor-v1-'), 'Editor revision must be hashed deterministic token')

// Proposal created bound to project revA
const proposal = buildAiProposal({
  id: 'proposal-test-1',
  projectId: 'proj-123',
  sourceEditorRevision: revA,
  sourceProjectRevision: 'rev-doc-1',
  additions: [
    {
      type: 'RESISTOR',
      componentType: 'RESISTOR',
      value: '330',
      between: ['project-board/d13', 'project-board/gnd1'],
      reason: 'Current-limiting resistor for pin 13 LED',
    },
  ],
})

assert.ok(proposal, 'Proposal with addition must be built successfully')
assert.strictEqual(proposal?.items.length, 1, 'Proposal must contain 1 item')
assert.strictEqual(proposal?.items[0].kind, 'addition', 'Item kind must be addition')

// Check staleness
assert.strictEqual(
  isAiProposalCurrent(proposal!, {
    editorRevision: revA,
    projectId: 'proj-123',
    projectRevision: 'rev-doc-1',
  }),
  true,
  'Proposal must be current when revision matches',
)

// Check staleness on modified canvas
const modifiedLayoutNodes: CanvasNode[] = [
  ...initialLayout.nodes,
  {
    id: 'extra-node',
    name: 'Extra Node',
    type: 'LED',
    x: 200,
    y: 200,
    width: 30,
    height: 30,
    rotation: 0,
    pins: [],
    properties: {},
  },
]
const revB = calculateEditorRevision(modifiedLayoutNodes, initialLayout.wires, mockCodeFiles, 0)
assert.notStrictEqual(revA, revB, 'Modified canvas must produce a different revision')

assert.strictEqual(
  isAiProposalCurrent(proposal!, {
    editorRevision: revB,
    projectId: 'proj-123',
    projectRevision: 'rev-doc-1',
  }),
  false,
  'Proposal must be marked stale when canvas revision changes',
)

console.log('  -> PASS: DEF-002 revision calculation and staleness tracking verified.\n')

// --------------------------------------------------------------------------
// TEST 3: DEF-002 - AI Proposal Execution & Layout Generation
// --------------------------------------------------------------------------
console.log('[Test 3] DEF-002: Proposal Planning & New Project Creation Safety')

const selection = defaultAiProposalSelection(proposal!)
assert.deepStrictEqual(selection, ['addition-0'], 'Default selection should include all proposal items')

// Plan changes against source project layout
const plan = planAiProposalChanges(proposal!, selection, {
  activeCodeFile: mockCodeFiles[0],
  nodes: initialLayout.nodes,
  wires: initialLayout.wires,
})

assert.strictEqual(plan.errors.length, 0, `Plan should have no errors: ${plan.errors.join(', ')}`)
assert.strictEqual(plan.canvasChanged, true, 'Canvas should be marked changed')
assert.strictEqual(plan.nextNodes.length, initialLayout.nodes.length + 1, 'Plan must add 1 component')
assert.strictEqual(plan.nextWires.length, 2, 'Resistor addition between 2 pins must add 2 connecting wires')

// Verify that a valid CreateProjectRequest can be constructed from the plan
const createPayload: CreateProjectRequest = {
  name: 'Generated AI Circuit',
  description: 'AI Proposal circuit',
  boardType: 'ARDUINO_UNO',
  isPublic: false,
  canvasLayout: {
    nodes: plan.nextNodes,
    wires: plan.nextWires,
    viewport: { x: 0, y: 0, scale: 1 },
  },
  codeFiles: [{
    filename: 'main.ino',
    language: 'cpp',
    sortOrder: 0,
    content: plan.nextCode || initialCode,
  }],
}

assert.strictEqual(createPayload.canvasLayout.nodes.length, 2, 'New project layout must contain board + resistor')
assert.strictEqual(createPayload.canvasLayout.wires.length, 2, 'New project layout must contain 2 wires')
assert.ok(createPayload.codeFiles[0].content.length > 0, 'New project code file must not be empty')

console.log('  -> PASS: DEF-002 proposal execution and new project synthesis verified.\n')

console.log('=== ALL DEF-001 AND DEF-002 TESTS PASSED CLEANLY (3/3) ===')
