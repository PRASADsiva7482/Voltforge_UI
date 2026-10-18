// Real routes and stores with an isolated persisted API fixture. No production auth bypass.
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const user = { id: 'flow-user', keycloakId: 'flow-user', username: 'engineer', displayName: 'Test Engineer', email: 'test@example.invalid', role: 'USER', accountStatus: 'ACTIVE' }
const server = await createServer({ root, cacheDir: 'node_modules/.cache/project-flow-vite', server: { host: 'localhost', port: 3118, strictPort: true }, plugins: [{ name: 'project-flow-auth', enforce: 'pre', transform(code, id) {
  if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop = () => {}; return <AuthContext.Provider value={{user:${JSON.stringify(user)},isAuthenticated:true,isLoading:false,isRedirecting:false,error:null,login:noop,logout:noop,signup:noop,changePassword:noop,configureTotp:noop,manageAccount:noop}}>{children}</AuthContext.Provider> }`
} }] })
let browser, releaseCreate
const records = new Map(), creates = [], saves = [], compiles = []
let failCreate = false, fieldFailure = false, gate
try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method(), path = url.pathname
    if (path.startsWith('/src/')) return route.continue()
    const ok = data => route.fulfill({ json: { success: true, data } })
    if (path.endsWith('/projects') && method === 'POST') {
      const payload = route.request().postDataJSON(); creates.push(payload)
      if (gate) await gate
      if (failCreate) return route.fulfill({ status: 503, json: { success: false } })
      if (fieldFailure) return route.fulfill({ status: 400, json: { success: false, errorCode: 'VALIDATION_ERROR', data: { boardType: 'Choose a supported development board' } } })
      const id = `created-${creates.length}`
      const project = { ...payload, id, owner: user, documentRevision: '0', createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', forkCount: 0, viewCount: 0, codeFiles: payload.codeFiles.map((file, i) => ({ ...file, id: `code-${i}` })) }
      records.set(id, project); return ok(project)
    }
    const match = path.match(/\/projects\/([^/]+)$/), project = match && records.get(match[1])
    if (project && method === 'GET') return ok(project)
    if (project && method === 'PUT') {
      const payload = route.request().postDataJSON(); saves.push({ id: project.id, payload })
      Object.assign(project, payload, { documentRevision: String(Number(project.documentRevision) + 1) })
      project.codeFiles = project.codeFiles.map((file, i) => ({ ...file, id: `code-${i}` }))
      return ok(project)
    }
    if (path.endsWith('/projects')) return ok({ content: [...records.values()], totalElements: records.size, totalPages: 1, last: true, page: 0, size: 24 })
    if (path.includes('compile')) { compiles.push(route.request().postDataJSON()); return ok({ success: false, boardType: compiles.at(-1).boardType, compiler: 'fixture', stderr: 'Toolchain unavailable in test' }) }
    if (path.includes('/users/')) return ok(user)
    if (path.includes('/components')) return ok([])
    return route.fulfill({ status: 503, json: { success: false } })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const visit = path => page.goto('http://localhost:3118' + path)
  const create = () => page.getByRole('button', { name: 'Create project', exact: true })
  const state = () => page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/projectStore.ts')
    const { useCanvasStore } = await import('/src/store/canvasStore.ts')
    return { project: useProjectStore.getState().currentProject, nodes: useCanvasStore.getState().documentNodes }
  })
  await visit('/projects/new?board=INVALID')
  assert.equal(await page.locator('#project-name').inputValue(), '')
  await page.locator('#project-name').fill('Untitled circuit'); await page.locator('#project-description').fill('Valid desc')
  await create().click()
  assert.equal(creates.length, 0); assert.equal(await page.locator('#project-name').getAttribute('aria-invalid'), 'true')
  await page.locator('#project-name-error').getByText('Project name cannot be "Untitled circuit". Please choose a descriptive name.').waitFor()

  await page.locator('#project-name').fill(''); await create().click()
  assert.equal(creates.length, 0); assert.equal(await page.locator('#project-name').getAttribute('aria-invalid'), 'true')
  await page.locator('#project-name').fill('   '); await create().click(); assert.equal(creates.length, 0)
  await page.locator('#project-name').fill('  Sensor "test"  ')
  await page.locator('#project-description').fill('')
  await create().click()
  assert.equal(creates.length, 0); assert.equal(await page.locator('#project-description').getAttribute('aria-invalid'), 'true')
  await page.locator('#project-description-error').getByText('Enter a project description.').waitFor()
  assert.equal(await page.evaluate(() => document.activeElement.id), 'project-description')

  await page.locator('#project-description').fill('  Board-specific project  ')
  await create().click()
  await page.locator('#project-board-error').getByText('Choose a supported development board.').waitFor()
  assert.equal(await page.evaluate(() => document.activeElement.id), 'project-boardType')
  assert.equal(creates.length, 0)
  console.log('PASS empty/whitespace/untitled names, mandatory description, stale board ID, inline errors and focus')

  await page.locator('#project-boardType').selectOption('ESP32')
  failCreate = true; await create().click(); await page.getByRole('alert').filter({ hasText: 'Your entries are preserved' }).waitFor()
  assert.equal(await page.locator('#project-name').inputValue(), '  Sensor "test"  ')
  assert.equal(await page.locator('#project-boardType').inputValue(), 'ESP32')
  failCreate = false; fieldFailure = true; await create().click()
  await page.locator('#project-board-error').getByText('Choose a supported development board', { exact: true }).waitFor()
  fieldFailure = false
  console.log('PASS API failure preserves values and server validation maps to its field')

  gate = new Promise(resolve => { releaseCreate = resolve })
  await create().click()
  await page.waitForFunction(() => document.querySelector('button[type=submit]').disabled)
  await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await page.waitForTimeout(100); assert.equal(creates.length, 3)
  releaseCreate(); gate = undefined
  await page.waitForURL('**/editor/created-3')
  await page.getByLabel('Project development board').getByText('ESP32 DevKit V1', { exact: true }).waitFor()
  let loaded = await state()
  assert.equal(loaded.project.id, 'created-3'); assert.equal(loaded.project.name, 'Sensor "test"')
  assert.equal(loaded.project.description, 'Board-specific project'); assert.equal(loaded.project.isPublic, false)
  assert.equal(loaded.nodes[0].type, 'ESP32'); assert(loaded.nodes[0].pins.length > 0)
  assert(loaded.project.codeFiles[0].content.includes('ESP32 DevKit V1'))
  console.log('PASS creation uses server ID, prevents duplicate requests and initializes the saved ESP32 schematic')

  await page.evaluate(async () => (await import('/src/store/canvasStore.ts')).useCanvasStore.getState().updateNode('project-board', { x: 333 }))
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/projects/created-3')),
    page.getByRole('button', { name: /^Save/ }).first().click(),
  ])
  assert.equal(saves.at(-1).id, 'created-3'); assert.equal(saves.at(-1).payload.boardType, 'ESP32')
  await page.reload(); await page.getByLabel('Project development board').getByText('ESP32 DevKit V1', { exact: true }).waitFor()
  loaded = await state(); assert.equal(loaded.nodes[0].x, 333); assert.equal(loaded.project.boardType, 'ESP32')
  await visit('/projects'); await page.locator('.vf-project-card').filter({ hasText: 'Sensor "test"' }).getByRole('button', { name: 'Open project', exact: true }).click()
  await page.waitForURL('**/editor/created-3'); await page.getByLabel('Project development board').getByText('ESP32 DevKit V1', { exact: true }).waitFor()
  assert.equal((await state()).nodes[0].x, 333)
  console.log('PASS save, reload and My Projects reopening preserve board and schematic against the same ID')

  await page.getByRole('button', { name: /Start simulation/i }).first().click()
  await page.waitForTimeout(1000)
  assert.equal(compiles.at(-1)?.boardType, 'ESP32')
  assert.equal(await page.getByRole('button', { name: /Stop simulation/i }).count(), 0)
  await page.getByRole('alert').filter({ hasText: 'Toolchain unavailable in test' }).waitFor()
  console.log('PASS compilation uses the saved target and reports unavailable compiler honestly')

  const legacy = { ...records.get('created-3'), id: 'legacy', boardType: 'ARDUINO_NANO', canvasLayout: undefined }
  records.set('legacy', legacy)
  await visit('/editor/legacy'); await page.getByLabel('Project development board').getByText('Arduino Nano', { exact: true }).waitFor()
  assert.equal((await state()).nodes[0].type, 'ARDUINO_NANO')
  records.set('empty', { ...legacy, id: 'empty', canvasLayout: { nodes: [], wires: [] } })
  await visit('/editor/empty'); await page.getByLabel('Project development board').getByText('Arduino Nano', { exact: true }).waitFor()
  assert.equal((await state()).nodes.length, 0)
  const compileCount = compiles.length
  await page.getByRole('button', { name: 'Start simulation', exact: true }).first().click()
  await page.getByText('Add the selected development board to the circuit before running firmware, or change the target in Project Settings.', { exact: true }).waitFor()
  assert.equal(compiles.length, compileCount)
  console.log('PASS legacy missing layouts initialize the saved board; deliberately empty layouts stay empty')

  await visit('/editor/created-3')
  await page.getByLabel('Project development board').getByText('ESP32 DevKit V1', { exact: true }).waitFor()
  await page.getByRole('button', { name: /show.*tools|editor tools/i }).first().click()
  await page.getByRole('button', { name: 'Project settings', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Arduino Nano Pins verified$|^Arduino Nano Shared pin layout$/ }).click()
  const savesBefore = saves.length
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Add this board to the schematic first' }).waitFor()
  assert.equal(saves.length, savesBefore)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(async () => {
    const { useCanvasStore } = await import('/src/store/canvasStore.ts')
    const { createInitialProjectLayout } = await import('/src/features/projects/projectConfiguration.ts')
    const layout = createInitialProjectLayout('ARDUINO_NANO')
    useCanvasStore.getState().loadCanvas(layout.nodes, layout.wires)
  })
  if (!await page.getByRole('button', { name: 'Project settings', exact: true }).isVisible()) await page.getByRole('button', { name: /show.*tools|editor tools/i }).first().click()
  await page.getByRole('button', { name: 'Project settings', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^Arduino Nano Pins verified$|^Arduino Nano Shared pin layout$/ }).click()
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.equal(saves.at(-1).id, 'created-3')
  assert.equal(saves.at(-1).payload.boardType, 'ARDUINO_NANO')
  assert.equal(saves.at(-1).payload.canvasLayout.nodes[0].type, 'ARDUINO_NANO')
  await page.reload(); await page.getByLabel('Project development board').getByText('Arduino Nano', { exact: true }).waitFor()
  assert.equal((await state()).nodes[0].type, 'ARDUINO_NANO')
  console.log('PASS settings reject absent targets and persist a placed target with its schematic atomically')

  await visit('/projects/new'); await page.locator('#project-name').fill('Public example')
  await page.locator('#project-description').fill('Public example description')
  await page.locator('#project-boardType').selectOption('RASPBERRY_PI_PICO')
  await page.getByLabel('Private project', { exact: true }).uncheck()
  await create().click(); await page.waitForURL('**/editor/created-4')
  assert.equal(creates.at(-1).isPublic, true); assert.equal(creates.at(-1).description, 'Public example description')
  assert.equal(creates.at(-1).canvasLayout.nodes[0].type, 'RASPBERRY_PI_PICO')
  console.log('PASS mandatory description and public/private boolean payloads')
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/projects/new')
  await page.getByLabel('Project name', { exact: true }).fill('')
  await create().click()
  assert.equal(await page.getByLabel('Project name', { exact: true }).getAttribute('aria-invalid'), 'true')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2))
  console.log('PASS mobile layout and stable accessible field names after validation')
  assert.deepEqual(errors, [])
} finally { releaseCreate?.(); await browser?.close(); await server.close() }
