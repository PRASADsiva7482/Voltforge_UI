// Real editor, engine, workers and stores; isolated API/auth fixtures (no live user data).
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'
const root = fileURLToPath(new URL('..', import.meta.url))
const user = { id: 'audit-user', keycloakId: 'audit-user', username: 'engineer', displayName: 'Audit Engineer', role: 'USER' }
const project = { id: 'audit-project', owner: user, name: 'Playground audit', description: 'Synthetic browser fixture', boardType: 'ARDUINO_UNO', isPublic: false, documentRevision: '0', codeFiles: [{ id: 'main', filename: 'main.ino', language: 'cpp', content: 'void setup() { Serial.begin(9600); Serial.println("audit serial output"); }\nvoid loop() { delay(100); }' }] }
const conversation = { id: 'audit-chat', projectId: project.id, title: 'Circuit discussion', updatedAt: '2026-10-18T00:00:00', createdAt: '2026-10-18T00:00:00' }
const message = { id: 'reply', conversationId: conversation.id, sequenceNumber: 2, role: 'assistant', content: 'Saved engineering discussion.\n\n' + 'Review the resistor and board pin assignments.\n\n'.repeat(35), status: 'completed', metadata: {} }
const server = await createServer({ root, cacheDir: 'node_modules/.cache/playground-audit-vite', server: { host: 'localhost', port: 3125, strictPort: true }, plugins: [{ name: 'audit-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop=()=>{}; return <AuthContext.Provider value={{user:${JSON.stringify(user)},isAuthenticated:true,isLoading:false,isRedirecting:false,error:null,login:noop,logout:noop,signup:noop,changePassword:noop,configureTotp:noop,manageAccount:noop}}>{children}</AuthContext.Provider> }`
} }] })
let browser, releaseSave, saveGate, compilerResult, compilerGate, releaseCompiler, failSave = false
const saves = [], compiles = [], errors = [], aiSends = []
const paged = content => ({ content, totalElements: content.length, totalPages: 1, last: true, page: 0, size: 50 })
try {
  await server.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.startsWith('/src/')) return route.continue()
    const ok = data => route.fulfill({ json: { success: true, data } })
    if (path.endsWith('/projects/' + project.id)) {
      if (request.method() === 'PUT') {
        const payload = request.postDataJSON(); saves.push(payload)
        if (saveGate) await saveGate
        if (failSave) return route.fulfill({ status: 409, json: { message: 'Project changed on another device. Reload before saving.' } })
        Object.assign(project, payload, { documentRevision: String(Number(project.documentRevision) + 1) })
        project.codeFiles = project.codeFiles.map((file, index) => ({ ...file, id: index === 0 ? 'main' : `code-${index}` }))
      }
      return ok(project)
    }
    if (path.endsWith('/projects')) return ok(paged([project]))
    if (path.endsWith('/ai/conversations')) return ok(paged([conversation]))
    if (path.endsWith('/ai/conversations/audit-chat')) return ok(conversation)
    if (path.endsWith('/ai/conversations/audit-chat/messages')) return ok(paged([message]))
    if (path.endsWith('/ai/conversations/audit-chat/messages/stream')) { aiSends.push(request.postDataJSON()); return route.fulfill({ status: 503, json: { message: 'Synthetic provider failure' } }) }
    if (path.includes('compile')) { compiles.push(request.postDataJSON()); const result = compilerResult || { success: false, stderr: 'audit: compiler unavailable', boardType: project.boardType }; if (compilerGate) await compilerGate; return ok(result) }
    if (path.includes('/components')) return ok([])
    return route.fulfill({ status: 503, json: { message: 'Unavailable in test fixture' } })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const visit = () => page.goto('http://localhost:3125/editor/audit-project?conversation=audit-chat')
  const state = () => page.evaluate(async () => ({
    project: (await import('/src/store/projectStore.ts')).useProjectStore.getState(),
    simulation: (await import('/src/store/simulationStore.ts')).useSimulationStore.getState(),
    canvas: (await import('/src/store/canvasStore.ts')).useCanvasStore.getState(),
  }))
  await visit()
  await page.locator('.vf-ai-chat__msg').waitFor()
  await page.locator('.monaco-editor').first().waitFor()
  // The editor runtime is served locally, including syntax support and workers.
  await page.waitForFunction(() => document.querySelector('.monaco-editor .view-lines')?.textContent.includes('Serial.begin'))
  await mkdir(new URL('../test-results/playground/', import.meta.url), { recursive: true })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async value => (await import('/src/store/themeStore.ts')).useThemeStore.getState().setTheme(value), theme)
    for (const [width, height] of [[1366,768], [1280,720], [1024,768], [800,600], [390,844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(150)
      const header = await page.locator('.vf-ai-chat__header').boundingBox()
      const body = await page.locator('.vf-editor__body').boundingBox()
      const composer = await page.locator('.vf-ai-chat__input-area').boundingBox()
      const dock = await page.locator('.vf-editor__ai-dock').boundingBox()
      assert(header.y >= body.y - 1, `AI header inside workspace at ${width}`)
      assert(composer.y + composer.height <= body.y + body.height + 1, `Composer anchored at ${width}`)
      if (width > 760) {
        const center = await page.locator('.vf-editor__center').boundingBox()
        assert(center.x + center.width <= dock.x + 1, `AI never obscures canvas/code at ${width}`)
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No viewport overflow at ${width}`)
      const input = page.getByRole('textbox', { name: 'Ask VoltForge AI', exact: true })
      assert(await input.isVisible())
      const scroll = page.locator('.vf-ai-chat__messages')
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
      assert.deepEqual(await page.locator('.vf-ai-chat__header').boundingBox(), header, 'Messages scroll without moving header')
      await page.screenshot({ path: `test-results/playground/${theme}-${width}.png` })
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  const handle = page.getByRole('separator', { name: 'Resize AI panel' })
  const before = await page.locator('.vf-editor__ai-dock').boundingBox()
  await handle.focus(); await handle.press('ArrowLeft')
  assert((await page.locator('.vf-editor__ai-dock').boundingBox()).width > before.width)
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 1)
  await page.evaluate(() => { document.documentElement.style.zoom = '1.25' })
  await page.waitForTimeout(150)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.evaluate(() => { document.documentElement.style.zoom = '' })
  console.log('PASS editor AI containment, independent scrolling, responsive themes, zoom, keyboard resize and conversation continuity')

  await page.getByRole('button', { name: 'Close assistant', exact: true }).click()
  await page.getByRole('button', { name: /show.*tools|editor tools/i }).first().click()
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('voltforge-theme')).state.preference), 'dark')
  await page.getByRole('button', { name: /hide.*tools|editor tools/i }).first().click()
  for (const [label, property] of [['Current Flow', 'showCurrentFlow'], ['Power stress', 'thermalHeatmapEnabled']]) {
    const previous = (await state()).simulation[property]
    const toggle = page.getByRole('button', { name: label, exact: true })
    await toggle.click(); assert.equal((await state()).simulation[property], !previous)
    assert.equal(await toggle.getAttribute('aria-pressed'), String(!previous))
    await toggle.click()
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG', exact: true }).click()])
  assert(download.suggestedFilename().endsWith('.png'))
  await download.saveAs('test-results/playground/circuit-export.png')
  const png = await readFile('test-results/playground/circuit-export.png')
  assert.equal(png.subarray(1,4).toString(), 'PNG')
  await page.getByRole('combobox', { name: 'Solver fidelity' }).selectOption('full-fidelity')
  assert.equal((await state()).simulation.fidelityMode, 'full-fidelity')
  await page.getByRole('combobox', { name: 'Solver fidelity' }).selectOption('adaptive')
  await page.locator('.monaco-editor .view-lines').first().click()
  await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.type('// browser audit edit')
  await page.waitForFunction(async () => (await import('/src/store/projectStore.ts')).useProjectStore.getState().activeCodeFile.content.includes('browser audit edit'))
  assert((await state()).project.activeCodeFile.content.includes('browser audit edit'), 'Real keyboard input must update the project code')
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/projects/audit-project')),
    page.getByRole('button', { name: /^Save/ }).first().click(),
  ])
  await page.waitForFunction(async () => !(await import('/src/store/projectStore.ts')).useProjectStore.getState().isDirty)
  assert(project.codeFiles[0].content.includes('browser audit edit'))
  console.log('PASS local Monaco editing/persistence, PNG bytes, fidelity selection and visualization controls')
  compilerGate = new Promise(resolve => { releaseCompiler = resolve })
  await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
  await page.getByRole('button', { name: 'Cancel execution preparation', exact: true }).waitFor()
  assert.equal((await state()).simulation.execution.phase, 'compiling')
  assert((await page.locator('.vf-serial-monitor__toolbar').innerText()).includes('Compiling'))
  await page.getByRole('button', { name: 'Cancel execution preparation', exact: true }).click()
  releaseCompiler(); compilerGate = undefined
  await page.waitForTimeout(100)
  assert.equal((await state()).simulation.execution.phase, 'stopped')
  assert.equal((await state()).simulation.isSimulating, false)
  assert.equal((await state()).simulation.serialEntries.filter(e => e.kind === 'output').length, 0)
  console.log('PASS pending compilation has shared status, cancellation aborts preparation and late response cannot start execution')
  await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
  await page.getByRole('alert').filter({ hasText: 'audit: compiler unavailable' }).waitFor()
  assert.equal((await state()).simulation.isSimulating, false)
  assert.equal(compiles[0].boardType, 'ARDUINO_UNO')
  assert(await page.getByRole('textbox', { name: 'Serial input' }).isDisabled())
  await page.getByRole('button', { name: 'Run source compatibility instead', exact: true }).click()
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).first().waitFor()
  await page.waitForFunction(async () => (await import('/src/store/simulationStore.ts')).useSimulationStore.getState().serialLogs.some(log => log.includes('audit serial output')))
  assert.equal((await state()).simulation.executionMode, 'interpreter')
  assert.equal((await state()).simulation.serialEntries.filter(e => e.kind === 'output' && e.text.includes('audit serial output')).length, 1)
  await page.evaluate(async () => { const s = (await import('/src/store/projectStore.ts')).useProjectStore.getState(); s.updateCodeFileContent(s.activeCodeFile.id, s.activeCodeFile.content + '\n// edited during execution') })
  assert.equal((await state()).simulation.restartRequired, true)
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).first().click()
  assert(await page.getByRole('textbox', { name: 'Serial input' }).isDisabled())
  const serialToggle = page.getByRole('button', { name: 'Serial Monitor', exact: false }).first()
  await serialToggle.click(); await page.waitForTimeout(100)
  assert.equal(await serialToggle.getAttribute('aria-expanded'), 'false')
  await serialToggle.click()
  const resizeSerial = page.getByRole('separator', { name: 'Resize serial monitor' })
  const consoleBefore = await page.locator('.vf-serial-monitor__body').boundingBox()
  await resizeSerial.focus(); await resizeSerial.press('ArrowUp')
  assert((await page.locator('.vf-serial-monitor__body').boundingBox()).height > consoleBefore.height)
  await page.getByRole('button', { name: 'Ask AI about this output' }).click()
  await page.getByText(/Serial snapshot:/).waitFor()
  await page.locator('.vf-ai-chat__textarea').fill('Explain the output')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Synthetic provider failure' }).waitFor()
  assert.equal(aiSends.at(-1).includeProjectContext, false)
  assert.equal(aiSends.at(-1).simulationState, undefined)
  assert.equal(aiSends.at(-1).code, undefined)
  await page.getByRole('checkbox', { name: /Share this project/ }).check()
  await page.getByRole('button', { name: 'Retry send', exact: true }).click()
  await page.waitForTimeout(200)
  assert.equal(aiSends.at(-1).includeProjectContext, true)
  assert.equal(aiSends.at(-1).projectId, project.id)
  assert(aiSends.at(-1).simulationState.selectedOutput.output.some(line => line.includes('audit serial output')))
  assert.equal(aiSends.at(-1).simulationState.selectedOutput.runId, (await state()).simulation.execution.id)
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click()
  await page.getByRole('button', { name: 'Copy serial logs' }).click()
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes('audit serial output'))
  const [serialDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export serial logs' }).click()])
  await serialDownload.saveAs('test-results/playground/serial-output.txt')
  assert((await readFile('test-results/playground/serial-output.txt', 'utf8')).includes('audit serial output'))
  await page.getByRole('button', { name: 'Clear serial output' }).click()
  assert.equal((await state()).simulation.serialEntries.length, 0)
  console.log('PASS serial resize/export/clear, firmware restart indicator and real output attachment with explicit privacy consent')
  console.log('PASS failed compilation never starts; explicit compatibility produces real interpreter output; stop and serial collapse work')

  const savedFirmware = (await state()).project.activeCodeFile.content
  await page.evaluate(async () => { const s = (await import('/src/store/projectStore.ts')).useProjectStore.getState(); s.updateCodeFileContent(s.activeCodeFile.id, 'void setup() { Serial.begin(38400); }\nvoid loop() { delay(100); }') })
  await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
  await page.getByRole('button', { name: 'Run source compatibility instead', exact: true }).click()
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).first().waitFor()
  await page.getByText('Waiting for firmware serial data.', { exact: false }).waitFor()
  assert.equal((await state()).simulation.serialEntries.filter(entry => entry.kind === 'output').length, 0)
  assert.equal((await state()).simulation.baudRate, 38400)
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).first().click()
  await page.evaluate(async content => { const s = (await import('/src/store/projectStore.ts')).useProjectStore.getState(); s.updateCodeFileContent(s.activeCodeFile.id, content) }, savedFirmware)
  console.log('PASS firmware baud changes and a running sketch with no output shows an honest waiting state')

  if (process.argv.includes('--compiled')) {
    const hex = await readFile('test-results/playground/compiled-audit.hex', 'utf8')
    compilerResult = { success: true, hex, boardType: 'ARDUINO_UNO', compiler: 'development remote compiler (captured synthetic build)' }
    await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
    await page.waitForFunction(async () => (await import('/src/store/simulationStore.ts')).useSimulationStore.getState().serialLogs.some(log => log.includes('VOLT_FORGE_AUDIT_NATIVE')))
    assert.equal((await state()).simulation.executionMode, 'avr8js')
    const nativeHandle = await page.waitForFunction(async () => {
      const s = (await import('/src/store/simulationStore.ts')).useSimulationStore.getState()
      return s.serialEntries.some(e => e.kind === 'output' && e.text.includes('VOLT_FORGE_AUDIT_NATIVE')) ? s.serialEntries : false
    })
    const nativeEntries = await nativeHandle.jsonValue()
    assert.equal(nativeEntries.filter(e => e.kind === 'output' && e.text.includes('VOLT_FORGE_AUDIT_NATIVE')).length, 1, `AVR output is not duplicated by byte and line callbacks: ${JSON.stringify(nativeEntries)}`)
    assert(!(await state()).simulation.serialLogs.some(line => line.includes('audit serial output')), 'Restart clears previous-run output')
    await page.getByRole('textbox', { name: 'Serial input' }).fill('echo-test')
    await page.getByRole('button', { name: 'Send serial input' }).click()
    await page.waitForFunction(async () => (await import('/src/store/simulationStore.ts')).useSimulationStore.getState().serialEntries.some(e => e.kind === 'output' && e.text.includes('echo-test')))
    assert((await state()).simulation.baudRate > 110000, 'Firmware reports its actual UART configuration')
    await page.getByRole('button', { name: 'Clear serial output' }).click()
    await page.getByRole('textbox', { name: 'Serial input' }).fill('after-clear')
    await page.getByRole('button', { name: 'Send serial input' }).click()
    await page.waitForFunction(async () => (await import('/src/store/simulationStore.ts')).useSimulationStore.getState().serialEntries.some(e => e.kind === 'output' && e.text.includes('after-clear')))
    assert(!(await state()).simulation.serialLogs.some(line => line.includes('VOLT_FORGE_AUDIT_NATIVE')))
    await page.getByRole('button', { name: 'Stop simulation', exact: true }).first().click()
    assert.equal(compiles.at(-1).boardType, 'ARDUINO_UNO')
    compilerResult = { ...compilerResult, boardType: 'ARDUINO_NANO' }
    await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
    await page.getByRole('alert').filter({ hasText: 'Compiler returned firmware for a different board' }).waitFor()
    assert.equal((await state()).simulation.isSimulating, false)
    compilerResult = { ...compilerResult, boardType: 'ARDUINO_UNO', hex: ':00000001FE' }
    await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
    await page.getByRole('alert').filter({ hasText: 'Unable to start simulation' }).waitFor()
    assert.equal((await state()).simulation.execution.phase, 'runtime-error')
    assert(await page.getByRole('button', { name: 'Start simulation', exact: true }).first().isEnabled())
    compilerResult = undefined
    console.log('PASS actual remote-compiled Uno firmware runs through Run/AVR8js with real serial output; mismatched compiler targets are rejected')
  }

  const edit = x => page.evaluate(async value => (await import('/src/store/canvasStore.ts')).useCanvasStore.getState().updateNode('project-board', { x: value }), x)
  await edit(310)
  saveGate = new Promise(resolve => { releaseSave = resolve })
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await page.waitForFunction(async () => (await import('/src/store/projectStore.ts')).useProjectStore.getState().isSaving)
  await edit(420)
  releaseSave(); saveGate = undefined
  await page.waitForFunction(async () => !(await import('/src/store/projectStore.ts')).useProjectStore.getState().isSaving)
  assert.equal((await state()).project.isDirty, true, 'Save acknowledgement must not clear a newer edit')
  assert.equal(saves.at(-1).canvasLayout.nodes[0].x, 310)
  failSave = true
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await page.locator('.vf-editor__save-state.is-error').waitFor()
  assert.equal((await state()).project.isDirty, true)
  const count = saves.length; await page.waitForTimeout(2300); assert.equal(saves.length, count, 'No retry storm after conflict')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('.vf-editor__back').first().click()
  assert(page.url().includes('/editor/'))
  failSave = false
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await page.waitForFunction(async () => !(await import('/src/store/projectStore.ts')).useProjectStore.getState().isDirty)
  await page.reload(); await page.locator('.vf-ai-chat__msg').waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Toolbar theme preference survives reload')
  assert.equal((await state()).canvas.documentNodes[0].x, 420)
  assert.equal((await state()).project.currentProject.id, project.id)
  assert.equal(await page.locator('.vf-ai-chat__msg').count(), 1)
  await page.goto('http://localhost:3125/projects')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.waitForURL('**/editor/audit-project')
  await page.getByLabel('Project development board').waitFor()
  failSave = true
  await edit(510)
  await page.waitForFunction(async () => (await import('/src/store/projectStore.ts')).useProjectStore.getState().isDirty)
  page.once('dialog', dialog => dialog.dismiss())
  await page.evaluate(() => history.back())
  await page.waitForTimeout(500)
  assert(page.url().includes('/editor/audit-project'), 'Rejected browser Back returns to the same editor')
  assert.equal((await state()).canvas.documentNodes[0].x, 510)
  assert.equal((await state()).project.isDirty, true)
  const acceptedNavigation = new Promise(resolve => page.once('dialog', async dialog => { await dialog.accept(); resolve() }))
  await page.evaluate(() => history.back())
  await acceptedNavigation
  await page.waitForURL('**/projects')
  assert.deepEqual(errors, [])
  console.log('PASS same-project saves, edit-during-save protection, visible conflicts, navigation guard and saved schematic/chat reload')
} finally { releaseSave?.(); releaseCompiler?.(); await browser?.close(); await server.close() }
