import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { validateProjectForm, createProjectPayload, resolveProjectConfiguration, DISALLOWED_PROJECT_NAMES } = await vite.ssrLoadModule('/src/features/projects/projectConfiguration.ts')
  const { BOARD_CATALOG } = await vite.ssrLoadModule('/src/features/canvas/boardCatalog.ts')
  const { getPinsForComponent } = await vite.ssrLoadModule('/src/features/canvas/pinRegistry.ts')
  const { useCanvasStore } = await vite.ssrLoadModule('/src/store/canvasStore.ts')
  const { useProjectStore } = await vite.ssrLoadModule('/src/store/projectStore.ts')
  const { captureEditorDocument } = await vite.ssrLoadModule('/src/features/editor/editorDocumentSnapshots.ts')
  const values = { name: '  Sensor "test"  ', description: '  description  ', boardType: 'ESP32', isPublic: false }
  for (const name of ['', '   ', 'x'.repeat(201), ...DISALLOWED_PROJECT_NAMES, 'UNTITLED CIRCUIT', '  Untitled Circuit  ']) {
    assert(validateProjectForm({ ...values, name }).name)
  }
  for (const description of ['', '   ', 'x'.repeat(5001)]) {
    assert(validateProjectForm({ ...values, description }).description)
  }
  for (const boardType of ['', 'INVALID', 'Arduino Uno R3', 'RASPBERRY_PI_5']) assert(validateProjectForm({ ...values, boardType }).boardType)
  assert.deepEqual(validateProjectForm(values), {})
  assert.throws(() => createProjectPayload({ ...values, description: '   ' }), /Invalid project configuration/)
  assert.throws(() => createProjectPayload({ ...values, name: 'Untitled circuit' }), /Invalid project configuration/)
  assert.equal(createProjectPayload(values).description, 'description')
  for (const board of BOARD_CATALOG) {
    const payload = createProjectPayload({ ...values, boardType: board.type })
    assert.equal(payload.boardType, board.type)
    assert.equal(payload.canvasLayout.nodes.length, 1)
    assert.equal(payload.canvasLayout.nodes[0].type, board.type)
    assert.deepEqual(payload.canvasLayout.nodes[0].pins.map(p => p.id), getPinsForComponent(board.type).map(p => p.id))
    assert(payload.codeFiles[0].content.includes(board.name))
    assert(payload.codeFiles[0].content.includes('\\"test\\"'))
    const project = { ...payload, id: 'saved-id', documentRevision: '3', codeFiles: payload.codeFiles.map(file => ({ ...file, id: 'code' })) }
    const restored = resolveProjectConfiguration(JSON.parse(JSON.stringify(project))).project
    assert.deepEqual(restored, project)
    useProjectStore.getState().setCurrentProject(restored)
    useCanvasStore.getState().loadCanvas(restored.canvasLayout.nodes, [])
    useCanvasStore.getState().updateNode('project-board', { x: 333 })
    const snapshot = captureEditorDocument()
    assert.equal(snapshot.projectId, 'saved-id'); assert.equal(snapshot.payload.boardType, board.type)
    assert.equal(snapshot.payload.canvasLayout.nodes[0].x, 333); assert.equal(snapshot.payload.expectedRevision, '3')
    assert.equal(payload.isPublic, false)
  }
  const base = { id: 'legacy', boardType: 'ESP32', codeFiles: [] }
  assert.equal(resolveProjectConfiguration(base).project.canvasLayout.nodes[0].type, 'ESP32')
  const empty = { ...base, canvasLayout: { nodes: [], wires: [] } }
  assert.equal(resolveProjectConfiguration(empty).project.canvasLayout, empty.canvasLayout)
  const stale = { ...base, boardType: 'RASPBERRY_PI_5' }
  assert.equal(resolveProjectConfiguration(stale).project.boardType, stale.boardType)
  assert.equal(resolveProjectConfiguration(stale).project.canvasLayout, undefined)
  const inferred = resolveProjectConfiguration({ ...base, boardType: undefined, canvasLayout: { nodes: [{ id: 'b', type: 'ESP32' }], wires: [] } })
  assert.equal(inferred.project.boardType, 'ESP32'); assert(inferred.notice)
  assert.equal(resolveProjectConfiguration({ ...base, boardType: undefined }).project.boardType, 'ARDUINO_UNO')
  const compiler = new URL('../../Voltforge_BL/src/main/java/in/voltforge/api/simulation/service/impl/FirmwareCompilerServiceImpl.java', import.meta.url)
  if (fs.existsSync(compiler)) {
    const targets = [...fs.readFileSync(compiler, 'utf8').matchAll(/Map.entry\(BoardType\.([A-Z0-9_]+), target/g)].map(match => match[1])
    assert.deepEqual(BOARD_CATALOG.map(board => board.type).sort(), targets.sort(), 'UI and existing BL target registries must agree')
  }
  console.log(`PASS project validation, ${BOARD_CATALOG.length} board/pin/firmware/save roundtrips, legacy compatibility and registry parity`)
} finally { await vite.close() }
