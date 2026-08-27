import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = path.join(root, 'dist')
const manifestPath = path.join(dist, '.vite', 'manifest.json')

const budgets = {
  entryChunkBytes: 150 * 1024,
  initialStaticJsBytes: 550 * 1024,
  initialStaticChunkCount: 16,
  individualJsChunkBytes: 450 * 1024,
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Production manifest not found at ${manifestPath}. Run the Vite production build first.`)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const entries = Object.entries(manifest)
const entry = entries.find(([, value]) => value.isEntry)
if (!entry) throw new Error('Production manifest has no application entry')

const failures = []
const fileSize = (file) => fs.statSync(path.join(dist, file)).size
const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

const [entryKey, entryValue] = entry
const initialStaticKeys = new Set()
const visitStaticImport = (key) => {
  if (initialStaticKeys.has(key)) return
  initialStaticKeys.add(key)
  for (const importedKey of manifest[key]?.imports ?? []) visitStaticImport(importedKey)
}
visitStaticImport(entryKey)

const entryBytes = fileSize(entryValue.file)
const initialStaticJsBytes = [...initialStaticKeys].reduce((total, key) => {
  const file = manifest[key]?.file
  return total + (file?.endsWith('.js') ? fileSize(file) : 0)
}, 0)
const initialStaticChunkCount = [...initialStaticKeys]
  .filter((key) => manifest[key]?.file?.endsWith('.js'))
  .length

const assetDirectory = path.join(dist, 'assets')
const jsAssets = fs.readdirSync(assetDirectory)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file: `assets/${file}`, size: fileSize(`assets/${file}`) }))
  .sort((left, right) => right.size - left.size)
const largestChunk = jsAssets[0]

assert(
  entryBytes <= budgets.entryChunkBytes,
  `Entry chunk is ${formatKb(entryBytes)}; budget is ${formatKb(budgets.entryChunkBytes)}`,
)
assert(
  initialStaticJsBytes <= budgets.initialStaticJsBytes,
  `Initial static JavaScript is ${formatKb(initialStaticJsBytes)}; budget is ${formatKb(budgets.initialStaticJsBytes)}`,
)
assert(
  initialStaticChunkCount <= budgets.initialStaticChunkCount,
  `Initial static graph has ${initialStaticChunkCount} chunks; budget is ${budgets.initialStaticChunkCount}`,
)
for (const asset of jsAssets) {
  assert(
    asset.size <= budgets.individualJsChunkBytes,
    `${asset.file} is ${formatKb(asset.size)}; per-chunk budget is ${formatKb(budgets.individualJsChunkBytes)}`,
  )
  assert(
    /-[A-Za-z0-9_-]{8}\.js$/.test(asset.file),
    `${asset.file} is not content-hashed for safe deployment caching`,
  )
}

const routeModules = [
  'src/features/editor/CircuitEditorPage.tsx',
  'src/features/labs/LabChallengeRunner.tsx',
  'src/features/landing/LandingPage.tsx',
]
for (const moduleKey of routeModules) {
  assert(entryValue.dynamicImports?.includes(moduleKey), `${moduleKey} is not a route-level dynamic import`)
}

const editorModule = manifest['src/features/editor/CircuitEditorPage.tsx']
const editorFeatureModules = [
  'src/features/pcb/PcbCanvas.tsx',
  'src/features/editor/CodeEditor.tsx',
  'src/features/ai/AiChatPanel.tsx',
  'src/features/editor/AiValidatorPanel.tsx',
  'src/features/editor/IotInspectorPanel.tsx',
  'src/features/editor/SolverDiagnosticsPanel.tsx',
]
for (const moduleKey of editorFeatureModules) {
  assert(editorModule?.dynamicImports?.includes(moduleKey), `${moduleKey} is not deferred behind the editor route`)
}

const simulatorFactory = 'src/features/simulator/deferredSimulationEngineFactory.ts'
const simulatorImportOwner = entries.find(([, value]) => value.dynamicImports?.includes(simulatorFactory))
assert(Boolean(simulatorImportOwner), 'Simulation engine/AVR factory is not dynamically imported')

const deferredModules = [...routeModules, ...editorFeatureModules, simulatorFactory]
for (const moduleKey of deferredModules) {
  assert(Boolean(manifest[moduleKey]), `${moduleKey} is missing from the production manifest`)
  assert(!initialStaticKeys.has(moduleKey), `${moduleKey} leaked into the initial static graph`)
}

const codeEditor = manifest['src/features/editor/CodeEditor.tsx']
const monacoHostDeferred = codeEditor?.dynamicImports?.some((key) => manifest[key]?.file?.includes('vendor-editor-'))
assert(monacoHostDeferred, 'Monaco editor host is not dynamically imported from the code editor chunk')

if (failures.length > 0) {
  console.error('Bundle budget failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log([
    'bundle budget passed',
    `entry ${formatKb(entryBytes)} / ${formatKb(budgets.entryChunkBytes)}`,
    `initial static JS ${formatKb(initialStaticJsBytes)} / ${formatKb(budgets.initialStaticJsBytes)}`,
    `initial chunks ${initialStaticChunkCount} / ${budgets.initialStaticChunkCount}`,
    `largest chunk ${largestChunk.file} ${formatKb(largestChunk.size)} / ${formatKb(budgets.individualJsChunkBytes)}`,
    'editor, lab, AI, Monaco host, PCB, diagnostics, and simulator boundaries verified',
  ].join(' | '))
}
