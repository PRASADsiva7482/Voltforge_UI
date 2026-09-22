import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } })
const checks = []
async function check(name, action) { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name) }
try {
  const { useCanvasStore: canvas } = await vite.ssrLoadModule('/src/store/canvasStore.ts')
  const { usePcbStore: pcb } = await vite.ssrLoadModule('/src/store/pcbStore.ts')
  const { useProjectStore: project } = await vite.ssrLoadModule('/src/store/projectStore.ts')
  const { captureEditorDocument, exceedsProjectSaveBudget, MAX_PROJECT_SAVE_BYTES, hasEditsSince, isCurrentDocumentSession } = await vite.ssrLoadModule('/src/features/editor/editorDocumentSnapshots.ts')
  const { LogicRegistry } = await vite.ssrLoadModule('/src/features/simulator/logic/LogicRegistry.ts')
  const seed = { id: 'led', type: 'LED_STANDARD', x: 20, y: 20, properties: { isLit: false, ledColor: 'red', customAuthored: 'keep me' } }
  function load() {
    canvas.getState().resetCanvas(); pcb.getState().resetPcb()
    canvas.getState().loadCanvas([seed], [])
    project.getState().setCurrentProject({ id: 'document-test', documentRevision: '7', updatedAt: 'revision-1', owner: { keycloakId: 'owner' }, canvasLayout: {}, codeFiles: [{ id: 'code', filename: 'main.ino', content: '// original', language: 'cpp', sortOrder: 0 }] })
  }
  await check('Save budget counts UTF-8 JSON bytes including escaping and the exact boundary', () => {
    const overhead = Buffer.byteLength(JSON.stringify({ notes: '' }))
    assert.equal(exceedsProjectSaveBudget({ notes: 'x'.repeat(MAX_PROJECT_SAVE_BYTES - overhead) }), false)
    assert.equal(exceedsProjectSaveBudget({ notes: 'x'.repeat(MAX_PROJECT_SAVE_BYTES - overhead + 1) }), true)
    assert.equal(exceedsProjectSaveBudget({ notes: 'Ω'.repeat(MAX_PROJECT_SAVE_BYTES / 2) }), true)
    assert.equal(exceedsProjectSaveBudget({ notes: '"'.repeat(MAX_PROJECT_SAVE_BYTES / 2) }), true)
  })
  await check('Firmware pin handlers update live motor, LED and shift-register outputs without editing the document', () => {
    load()
    canvas.getState().loadCanvas([
      { id: 'motor', type: 'MOTOR_DC', x: 0, y: 0, properties: {} },
      { id: 'led', type: 'LED_STANDARD', x: 100, y: 0, properties: {} },
      { id: 'shift', type: 'IC_74HC595', x: 200, y: 0, properties: {} },
    ], [])
    const before = canvas.getState(), snapshot = captureEditorDocument()
    LogicRegistry.dispatch('MOTOR_DC', 'motor', 'pin1', 'HIGH')
    LogicRegistry.dispatch('LED_STANDARD', 'led', 'anode', 'HIGH')
    LogicRegistry.dispatch('IC_74HC595', 'shift', 'SER', 'HIGH')
    LogicRegistry.dispatch('IC_74HC595', 'shift', 'SHCP', 'HIGH')
    LogicRegistry.dispatch('IC_74HC595', 'shift', 'STCP', 'HIGH')
    const after = canvas.getState()
    assert.equal(after.nodesById.get('motor').properties.requestedOn, true)
    assert.equal(after.nodesById.get('led').properties.requestedOn, true)
    assert.equal(after.nodesById.get('shift').properties.shiftValue, 1)
    assert.equal(after.documentNodes, before.documentNodes)
    assert.equal(after.localDocumentRevision, before.localDocumentRevision)
    assert.equal(after.modelRevision, before.modelRevision)
    assert.equal(hasEditsSince(snapshot), false)
  })
  await check('Runtime and irrelevant PCB writes do not revise or serialize the authored document', () => {
    load()
    const initial = canvas.getState(), pcbRevision = pcb.getState().localDocumentRevision
    const stringify = JSON.stringify; let serializations = 0
    JSON.stringify = function(...args) { serializations++; return Reflect.apply(stringify, JSON, args) }
    try {
      for (let i = 0; i < 1200; i++) {
        canvas.getState().updateRuntimeNode('led', { properties: { isLit: i % 2 === 0, runtimeOnlyKey: i } })
        canvas.getState().batchUpdateRuntimeNodes([{ id: 'led', changes: { properties: { brightness: i } } }])
        pcb.getState().selectFootprint(null); pcb.getState().setRatlines([]); pcb.getState().setDrcViolations([])
      }
    } finally { JSON.stringify = stringify }
    const current = canvas.getState()
    assert.equal(serializations, 0); assert.equal(current.documentNodes, initial.documentNodes)
    assert.equal(current.localDocumentRevision, initial.localDocumentRevision); assert.equal(current.modelRevision, initial.modelRevision)
    assert.equal(pcb.getState().localDocumentRevision, pcbRevision)
    assert.equal(current.documentNodes[0].properties.runtimeOnlyKey, undefined)
  })
  await check('Real edits preserve authored properties without copying runtime feedback', () => {
    const live = canvas.getState().nodes[0]
    canvas.getState().commitNodeUpdate('led', { properties: { ...live.properties, ledColor: 'blue' } })
    canvas.getState().updateNode('led', { x: 173 })
    const saved = captureEditorDocument().payload.canvasLayout.nodes[0]
    assert.equal(saved.properties.ledColor, 'blue'); assert.equal(saved.properties.isLit, false)
    assert.equal(saved.properties.customAuthored, 'keep me'); assert.equal(saved.properties.runtimeOnlyKey, undefined)
    assert.equal(saved.properties.brightness, undefined); assert.equal(saved.x, 173)
  })
  await check('Viewport edits revise the document; selection and wiring tools do not', () => {
    const before = canvas.getState().localDocumentRevision
    canvas.getState().selectNode('led'); canvas.getState().setWiringColor('#ffffff'); canvas.getState().startWiring('led','anode'); canvas.getState().cancelWiring()
    assert.equal(canvas.getState().localDocumentRevision, before)
    canvas.getState().setViewport({ x: 11, y: 22, scale: .8 })
    assert.equal(canvas.getState().localDocumentRevision, before + 1)
    canvas.getState().setViewport({ x: 11, y: 22, scale: .8 })
    assert.equal(canvas.getState().localDocumentRevision, before + 1)
  })
  await check('Load and derived PCB generation do not become local edits', () => {
    const previous = canvas.getState().localDocumentRevision, previousPcb = pcb.getState().localDocumentRevision
    canvas.getState().loadCanvas([seed], [])
    pcb.getState().loadPcb({ boardWidth_mm: 123 })
    pcb.getState().setFootprints([{ id: 'fp', componentId: 'led', name: 'LED', componentType: 'LED_STANDARD', packageType: 'DIP', x: 10, y: 10, rotation: 0, width: 10, height: 10, pads: [] }], 'derived')
    assert.equal(canvas.getState().localDocumentRevision, previous); assert.equal(pcb.getState().localDocumentRevision, previousPcb)
    pcb.getState().setBoardDimensions(155, 90)
    assert.equal(pcb.getState().localDocumentRevision, previousPcb + 1)
  })
  await check('PCB document fields participate; transient route/DRC selection does not', () => {
    const initial = pcb.getState().localDocumentRevision
    pcb.getState().setActiveLayer('B.Cu'); pcb.getState().setGridSnap(.5); pcb.getState().setTraceWidth(12)
    pcb.getState().setViewport({ x: 10, y: 20, scale: 1.2 }); pcb.getState().toggleLayerVisibility('F.Silk')
    pcb.getState().updateFootprintPosition('fp', 45, 55, 90)
    pcb.getState().addVia({ id:'via',x:20,y:25,drill_mm:.3,pad_mm:.6 })
    const after = pcb.getState().localDocumentRevision
    assert.equal(after, initial + 7)
    pcb.getState().startRouting({ componentId:'led',padId:'anode',x:1,y:1 }); pcb.getState().updateActiveRoute({ x:2,y:2 }); pcb.getState().cancelRouting()
    assert.equal(pcb.getState().localDocumentRevision, after)
    assert.equal(captureEditorDocument().payload.componentConfig.pcbLayout.footprints[0].x, 45)
  })
  await check('Undo and redo restore authored state instead of simulated values', () => {
    load(); canvas.getState().updateRuntimeNode('led', { properties: { isLit: true, runtimeOnlyKey: 99 } })
    canvas.getState().commitNodeUpdate('led', { name: 'Changed LED' })
    canvas.getState().undo()
    assert.notEqual(canvas.getState().documentNodes[0].name, 'Changed LED')
    assert.equal(canvas.getState().documentNodes[0].properties.isLit, false)
    canvas.getState().redo()
    assert.equal(canvas.getState().documentNodes[0].name, 'Changed LED')
    assert.equal(canvas.getState().documentNodes[0].properties.runtimeOnlyKey, undefined)
  })
  await check('Save snapshot remains immutable and only local edits invalidate its acknowledgement', () => {
    load(); const snapshot = captureEditorDocument()
    assert.equal(snapshot.payload.expectedRevision, '7')
    canvas.getState().updateRuntimeNode('led', { properties: { isLit: true } })
    assert.equal(hasEditsSince(snapshot), false)
    project.getState().updateCodeFileContent('code', '// changed during save')
    canvas.getState().updateNode('led', { x: 299 }); pcb.getState().setBoardDimensions(200, 100)
    assert.equal(hasEditsSince(snapshot), true)
    assert.equal(snapshot.payload.codeFiles[0].content, '// original'); assert.equal(snapshot.payload.canvasLayout.nodes[0].x, 20)
    assert.equal(snapshot.payload.componentConfig.pcbLayout.boardWidth_mm, 100)
    project.getState().setCurrentProject({ ...project.getState().currentProject })
    assert.equal(isCurrentDocumentSession(snapshot), false)
  })
  await check('Code no-ops and metadata acknowledgements preserve local code and dirty state', () => {
    load(); const previous = project.getState().codeRevision
    project.getState().updateCodeFileContent('code','// original'); project.getState().updateCodeFileContent('missing','text')
    assert.equal(project.getState().codeRevision, previous); assert.equal(project.getState().isDirty, false)
    project.getState().updateCodeFileContent('code','// pending')
    const session = project.getState().documentSession
    project.getState().mergeProjectMetadata({ ...project.getState().currentProject, name:'Renamed', updatedAt:'revision-2', codeFiles:[] })
    assert.equal(project.getState().currentProject.name,'Renamed'); assert.equal(project.getState().activeCodeFile.content,'// pending')
    assert.equal(project.getState().documentSession,session); assert.equal(project.getState().isDirty,true)
  })
} catch(error) { checks.push({ name:'Document revision contract',passed:false,error:error.stack }); throw error }
finally {
  await vite.close()
  fs.writeFileSync(root + '/docs/reports/vfopt-ui-011-document-revision-tests.json',JSON.stringify({ task:'VFOPT-UI-011',capturedAt:new Date().toISOString(),checks,status:checks.every(check=>check.passed)?'passed':'failed' },null,2)+'\n')
}
