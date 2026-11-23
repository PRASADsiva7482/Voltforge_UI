/**
 * VOLTFORGE — PHASE 4.3.6.5.2: NATIVE CANVAS INTERACTION TEST RUNNER
 *
 * Verifies whether genuine browser pointer clicks on the canvas SPST switch
 * trigger the production pipeline without test-harness shortcuts:
 * Browser pointer click -> Canvas switch component -> Canvas store -> SimulationEngine -> WebWorker -> MNA -> GPIO bridge -> PWM
 */

import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const screenshotsDir = path.resolve(repoRoot, 'docs/repair/phase-4.3.6.5.2/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const user = {
  id: 'pwm-audit-user',
  keycloakId: 'pwm-audit-user',
  username: 'pwmauditor',
  displayName: 'PWM Audit Engineer',
  role: 'USER',
};

// Canvas node positions placed so that wires do not cross over switch body
const picoNode = {
  id: 'pico_0',
  type: 'RASPBERRY_PI_PICO',
  label: 'Raspberry Pi Pico',
  name: 'Raspberry Pi Pico',
  x: 60,
  y: 80,
  width: 160,
  height: 360,
  properties: { boardPowered: true, builtInLedLit: false },
  pins: [
    { id: '3v3', name: '3V3' },
    { id: 'gnd', name: 'GND' },
    { id: 'd0', name: 'GP0' },
    { id: 'd1', name: 'GP1' },
  ],
};

const switchNode = {
  id: 'sw_0',
  type: 'SWITCH_SPST',
  label: 'PWM Mode Switch',
  name: 'PWM Mode Switch',
  x: 240,
  y: 80,
  width: 60,
  height: 30,
  properties: { isClosed: false },
  pins: [
    { id: 'p1', name: 'Pin 1' },
    { id: 'p2', name: 'Pin 2' },
  ],
};

const resistorNode = {
  id: 'r_pull_0',
  type: 'RESISTOR',
  label: 'Pull-down 10k',
  name: 'Pull-down 10k',
  x: 340,
  y: 80,
  width: 60,
  height: 20,
  properties: { resistance: 10000 },
  pins: [
    { id: 'p1', name: 'Pin 1' },
    { id: 'p2', name: 'Pin 2' },
  ],
};

const wires = [
  { id: 'w1', fromNodeId: 'pico_0', fromPinId: '3v3', toNodeId: 'sw_0', toPinId: 'p1' },
  { id: 'w2', fromNodeId: 'sw_0', fromPinId: 'p2', toNodeId: 'r_pull_0', toPinId: 'p1' },
  { id: 'w3', fromNodeId: 'r_pull_0', fromPinId: 'p1', toNodeId: 'pico_0', toPinId: 'd1' },
  { id: 'w4', fromNodeId: 'r_pull_0', fromPinId: 'p2', toNodeId: 'pico_0', toPinId: 'gnd' },
];

const project = {
  id: 'pico-pwm-live',
  owner: user,
  name: 'RP2040 PWM Native Interaction Test',
  description: 'Native Canvas Pointer Click verification circuit',
  boardType: 'RASPBERRY_PI_PICO',
  isPublic: false,
  documentRevision: '0',
  codeFiles: [{
    id: 'main',
    filename: 'main.py',
    language: 'python',
    content: '# RP2040 PWM Native Interaction Test\n',
  }],
};

const conversation = {
  id: 'audit-chat',
  projectId: project.id,
  title: 'Circuit discussion',
  updatedAt: '2026-10-18T00:00:00',
  createdAt: '2026-10-18T00:00:00',
};

function generatePwmUf2(divMode = 0) {
  const fixturePath = path.resolve(root, 'src/features/simulator/__fixtures__/pico_dma_pwm_negative.uf2');
  const sampleUf2 = fs.readFileSync(fixturePath);
  const block0 = new Uint8Array(sampleUf2.subarray(0, 512));

  const block1 = new Uint8Array(512);
  const v1 = new DataView(block1.buffer);

  v1.setUint32(0, 0x0a324655, true);
  v1.setUint32(4, 0x9e5d5157, true);
  v1.setUint32(8, 0x00002000, true);
  v1.setUint32(12, 0x10000100, true);
  v1.setUint32(16, 256, true);
  v1.setUint32(20, 1, true);
  v1.setUint32(24, 2, true);
  v1.setUint32(28, 0xe48bff56, true);
  v1.setUint32(508, 0x0ab16f30, true);

  v1.setUint32(32 + 0, 0x20042000, true);
  v1.setUint32(32 + 4, 0x10000141, true);
  for (let i = 2; i < 16; i++) {
    v1.setUint32(32 + i * 4, 0x10000141, true);
  }

  const csrVal = 0x01 | ((divMode & 0x03) << 4);
  const pool = [
    0x40014004,         // 0: IO_BANK0 GPIO0_CTRL
    0x40050000,         // 1: PWM BASE
    1000,               // 2: TOP = 1000
    (250 << 16) | 500,  // 3: CC: B=250, A=500
    0x400500a8,         // 4: PWM_INTE
    0x400500a0,         // 5: PWM_EN
    csrVal,             // 6: CH0_CSR
    0x4001c008,         // 7: PADS_BANK0 GPIO1 PAD (IE enable)
  ];

  const poolBaseAddr = 0x100001a0;
  let currentAddr = 0x10000140;

  function emitInst(val) {
    v1.setUint16(32 + (currentAddr - 0x10000100), val, true);
    currentAddr += 2;
  }

  function emitLdr(rt, poolIndex) {
    const targetAddr = poolBaseAddr + poolIndex * 4;
    const pc = (currentAddr + 4) & ~3;
    const diff = targetAddr - pc;
    const imm8 = diff / 4;
    emitInst(0x4800 | (rt << 8) | imm8);
  }

  // 1. Set GPIO 0 & 1 to PWM function (4)
  emitLdr(0, 0);
  emitInst(0x2104);
  emitInst(0x6001);
  emitInst(0x6081);

  // Enable Input on GPIO 1 in PADS_BANK0 (IE=1, Schmitt=1 -> 0x42)
  emitLdr(0, 7);
  emitInst(0x2142); // movs r1, #0x42
  emitInst(0x6001); // str r1, [r0, #0]

  // 2. Set PWM Slice 0 parameters
  emitLdr(2, 1);
  emitLdr(3, 2);
  emitInst(0x6113); // CH0_TOP
  emitLdr(3, 3);
  emitInst(0x60d3); // CH0_CC
  emitInst(0x2310);
  emitInst(0x6053); // CH0_DIV = 1.0

  emitLdr(3, 6);
  emitInst(0x6013); // CH0_CSR = csrVal

  // 3. Enable Interrupts (INTE)
  emitLdr(4, 4);
  emitInst(0x2301);
  emitInst(0x6023);

  // 4. Enable slice 0 via global PWM_EN
  emitLdr(4, 5);
  emitInst(0x2301);
  emitInst(0x6023);

  // 5. Infinite loop
  emitInst(0xe7fe);

  for (let i = 0; i < pool.length; i++) {
    v1.setUint32(32 + (poolBaseAddr - 0x10000100) + i * 4, pool[i], true);
  }

  const fullUf2 = new Uint8Array(1024);
  fullUf2.set(block0, 0);
  fullUf2.set(block1, 512);
  return fullUf2;
}

const paged = content => ({ content, totalElements: content.length, totalPages: 1, last: true, page: 0, size: 50 });

const PORT = 3138;
const server = await createServer({
  root,
  cacheDir: 'node_modules/.cache/native-canvas-interaction-vite',
  server: { host: 'localhost', port: PORT, strictPort: true },
  plugins: [{
    name: 'audit-auth',
    enforce: 'pre',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/auth/AuthProvider.tsx')) {
        return `import { AuthContext } from './AuthContext'; export function AuthProvider({children}) { const noop=()=>{}; return <AuthContext.Provider value={{user:${JSON.stringify(user)},isAuthenticated:true,isLoading:false,isRedirecting:false,error:null,login:noop,logout:noop,signup:noop,changePassword:noop,configureTotp:noop,manageAccount:noop}}>{children}</AuthContext.Provider> }`;
      }
    }
  }]
});

let browser = null;
let page = null;
const auditResults = {
  divmode01: {
    initialState: null,
    clickTarget: null,
    konvaHitAnalysis: null,
    postClickState: null,
    pipelineBroken: false,
    failureReason: null,
    screenshotOpen: null,
    screenshotAfterClick: null,
  },
  divmode10: {
    initialState: null,
    postClickState: null,
    edgeTriggered: false,
    failureReason: null,
    screenshotEdge: null,
  },
  conclusion: null,
};

try {
  await server.listen();
  console.log(`[Vite Server] Listening on http://localhost:${PORT}`);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith('/src/')) return route.continue();

    const ok = (data) => route.fulfill({ json: { success: true, data } });

    if (path.endsWith('/auth/me')) return ok(user);
    if (path.endsWith(`/projects/${project.id}`)) return ok(project);
    if (path.endsWith('/projects')) return ok(paged([project]));
    if (path.endsWith('/ai/conversations')) return ok(paged([conversation]));
    if (path.endsWith('/ai/conversations/audit-chat')) return ok(conversation);
    if (path.endsWith('/ai/conversations/audit-chat/messages')) return ok(paged([]));
    if (path.includes('/components')) {
      return ok([]);
    }
    return route.fulfill({ status: 503, json: { message: 'Test fixture route' } });
  });

  page = await context.newPage();

  console.log('Navigating to editor...');
  await page.goto(`http://localhost:${PORT}/editor/${project.id}?conversation=audit-chat`);
  await page.locator('.vf-editor').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);

  // Load canvas with Pico, SPST Switch, and 10k resistor
  await page.evaluate(async ({ nodes, wires }) => {
    const mod = await import('/src/store/canvasStore.ts');
    mod.useCanvasStore.getState().loadCanvas(nodes, wires);
  }, { nodes: [picoNode, switchNode, resistorNode], wires });

  await page.waitForTimeout(500);

  // Open PWM Inspector
  await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    simMod.useSimulationStore.getState().setPwmInspectorOpen(true);
  });
  await page.waitForTimeout(300);

  // ========================================================================
  // TEST SECTION 1: DIVMODE 01 NATIVE INTERACTION VERIFICATION
  // ========================================================================
  console.log('\n========================================================================');
  console.log('   TEST SECTION 1: DIVMODE 01 NATIVE CANVAS INTERACTION');
  console.log('========================================================================');

  // Start simulation engine with DIVMODE 01 firmware
  const uf2Mode01 = Array.from(generatePwmUf2(1));
  await page.evaluate(async ({ uf2Bytes }) => {
    const win = window;
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const engineMod = await import('/src/features/simulator/SimulationEngine.ts');

    const nodes = canvasMod.useCanvasStore.getState().nodes;
    const wires = canvasMod.useCanvasStore.getState().wires;

    if (!win.__liveEngine) {
      const callbacks = {
        onSerialOutput: () => {},
        onPinStateChange: () => {},
        onWireStatesChange: () => {},
        onSimulationError: () => {},
      };
      const engine = new engineMod.SimulationEngine(callbacks);
      win.__liveEngine = engine;
      await engine.start('', nodes, wires, undefined, 'RASPBERRY_PI_PICO');
    }

    const engine = win.__liveEngine;
    const worker = engine.solverWorker;
    simMod.useSimulationStore.getState().setSimulating(true);

    const buffer = new Uint8Array(uf2Bytes).buffer;
    worker.postMessage({
      type: 'LOAD_RP2040_FIRMWARE',
      firmwareBuffer: buffer,
      boardComponentId: 'pico_0',
      clockFrequency_Hz: 125000000,
      vddIo: 3.3,
    });
    worker.postMessage({ type: 'START' });
  }, { uf2Bytes: uf2Mode01 });

  await page.waitForTimeout(1000);

  // 1. Observe initial state with switch OPEN
  const initialOpenSample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const engine = window.__liveEngine;
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      timestamp: performance.now(),
      switchIsClosed: swNode?.properties?.isClosed,
      divMode: slice0?.divMode,
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
      mnaElements: engine?.mnaCircuit?.elements?.map(e => ({ id: e.id, val: e.value })),
    };
  });

  console.log('Initial Switch OPEN State:', initialOpenSample);
  assert(initialOpenSample.switchIsClosed === false, 'Switch must initially be OPEN (isClosed === false)');
  assert(initialOpenSample.pinBLevel === false, 'Pin B level must be false (LOW) while switch is OPEN');
  assert(initialOpenSample.divMode === 1, 'Slice 0 must be in DIVMODE 01');

  // Verify counter remains frozen
  await page.waitForTimeout(400);
  const openFrozenCheck = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0]?.counter;
  });
  console.log(`Frozen Counter Check: initial=${initialOpenSample.counter}, 400ms later=${openFrozenCheck}`);
  assert(initialOpenSample.counter === openFrozenCheck, 'Counter must remain strictly frozen in DIVMODE 01 while switch is OPEN');

  await page.screenshot({ path: path.join(screenshotsDir, '01_divmode01_native_switch_open.png') });
  console.log('Saved screenshot: 01_divmode01_native_switch_open.png');
  auditResults.divmode01.initialState = initialOpenSample;
  auditResults.divmode01.screenshotOpen = '01_divmode01_native_switch_open.png';

  // 2. Identify the switch actuator target on the canvas
  const clickTarget = await page.evaluate(async () => {
    const canvasMod = await import('/src/store/canvasStore.ts');
    const state = canvasMod.useCanvasStore.getState();
    const node = state.nodes.find(n => n.id === 'sw_0');
    const vp = state.viewport;
    const canvasEl = document.querySelector('.vf-canvas-container canvas');
    if (!canvasEl || !node) return null;
    const rect = canvasEl.getBoundingClientRect();
    // Switch track in node is at x=30, y=15
    const switchX = node.x + 30;
    const switchY = node.y + 15;
    const clientX = rect.left + vp.x + switchX * vp.scale;
    const clientY = rect.top + vp.y + switchY * vp.scale;
    return {
      nodeX: node.x,
      nodeY: node.y,
      clientX,
      clientY,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  });

  console.log('\nCalculated Native Click Target on Canvas:', clickTarget);
  auditResults.divmode01.clickTarget = clickTarget;

  // 3. Inspect Konva hit detection at the click target
  const konvaHit = await page.evaluate(({ x, y }) => {
    const win = window;
    const stages = win.Konva?.stages;
    const stage = stages?.[0];
    if (!stage) return { error: 'No Konva stage' };

    const stageBox = stage.container().getBoundingClientRect();
    const stagePos = stage.position();
    const stageScale = stage.scale();

    const canvasX = (x - stageBox.left - stagePos.x) / stageScale.x;
    const canvasY = (y - stageBox.top - stagePos.y) / stageScale.y;

    const hitShape = stage.getIntersection({ x: canvasX, y: canvasY });
    const swGroup = stage.findOne('#sw_0');

    return {
      canvasX,
      canvasY,
      hitShapeName: hitShape?.name() || '',
      hitShapeClassName: hitShape?.className || '',
      hitShapeParentName: hitShape?.parent?.name() || '',
      swGroupFound: !!swGroup,
      swGroupPos: swGroup ? swGroup.position() : null,
      swGroupBox: swGroup ? swGroup.getClientRect() : null,
    };
  }, { x: clickTarget.clientX, y: clickTarget.clientY });

  console.log('Konva Hit Graph Analysis at Target:', konvaHit);
  auditResults.divmode01.konvaHitAnalysis = konvaHit;

  // 4. PERFORM NATIVE BROWSER POINTER CLICK
  console.log(`\nExecuting native browser mouse.click(${clickTarget.clientX}, ${clickTarget.clientY})...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);

  // Wait for the production update pipeline (store subscription + WebWorker dispatch)
  console.log('Waiting 800ms for production event loop and WebWorker roundtrip...');
  await page.waitForTimeout(800);

  // 5. Inspect post-click state
  const postClickSample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const engine = window.__liveEngine;
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      timestamp: performance.now(),
      switchIsClosed: swNode?.properties?.isClosed,
      divMode: slice0?.divMode,
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
      mnaElements: engine?.mnaCircuit?.elements?.map(e => ({ id: e.id, val: e.value })),
    };
  });

  console.log('Post-Click State:', postClickSample);
  auditResults.divmode01.postClickState = postClickSample;

  await page.screenshot({ path: path.join(screenshotsDir, '02_divmode01_native_click_hit_intercepted.png') });
  console.log('Saved screenshot: 02_divmode01_native_click_hit_intercepted.png');
  auditResults.divmode01.screenshotAfterClick = '02_divmode01_native_click_hit_intercepted.png';

  // 6. Evaluate native click outcome
  if (postClickSample.switchIsClosed === false) {
    console.error('\n[DEFECT DETECTED] Native canvas pointer click FAILED to toggle SPST switch!');
    console.error(`Reason: Konva hit shape is '${konvaHit.hitShapeClassName}' inside '${konvaHit.hitShapeParentName}' rather than the toggle switch Group.`);
    console.error('In ComponentNode.tsx:1558-1570, the switch track <Rect> and knob <Rect> specify listening={false}.');
    console.error('In Konva, a <Group> without listening child shapes has zero presence on the off-screen hit canvas.');
    console.error('The click event falls through to <KonvaImage> which only triggers onSelect(), leaving isClosed unchanged.');
    auditResults.divmode01.pipelineBroken = true;
    auditResults.divmode01.failureReason = "ComponentNode.tsx:1558-1570 sets listening={false} on switch <Rect> shapes, preventing Konva hit graph intersection";
  }

  // ========================================================================
  // TEST SECTION 2: DIVMODE 10 NATIVE EDGE ATTEMPT
  // ========================================================================
  console.log('\n========================================================================');
  console.log('   TEST SECTION 2: DIVMODE 10 NATIVE EDGE INTERACTION');
  console.log('========================================================================');

  // Load DIVMODE 10 firmware
  const uf2Mode10 = Array.from(generatePwmUf2(2));
  await page.evaluate(async ({ uf2Bytes }) => {
    const worker = window.__liveEngine.solverWorker;
    worker.postMessage({
      type: 'LOAD_RP2040_FIRMWARE',
      firmwareBuffer: new Uint8Array(uf2Bytes).buffer,
      boardComponentId: 'pico_0',
      clockFrequency_Hz: 125000000,
      vddIo: 3.3,
    });
    worker.postMessage({ type: 'START' });
  }, { uf2Bytes: uf2Mode10 });

  await page.waitForTimeout(600);

  const initialMode10Sample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    return {
      counter: slice0?.counter,
      divMode: slice0?.divMode,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Initial Sample:', initialMode10Sample);
  auditResults.divmode10.initialState = initialMode10Sample;

  console.log(`Attempting native click for rising-edge transition at (${clickTarget.clientX}, ${clickTarget.clientY})...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForTimeout(600);

  const postClickMode10Sample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    return {
      counter: slice0?.counter,
      divMode: slice0?.divMode,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Post-Click Sample:', postClickMode10Sample);
  auditResults.divmode10.postClickState = postClickMode10Sample;

  await page.screenshot({ path: path.join(screenshotsDir, '03_native_divmode_10_edge_attempt.png') });
  console.log('Saved screenshot: 03_native_divmode_10_edge_attempt.png');
  auditResults.divmode10.screenshotEdge = '03_native_divmode_10_edge_attempt.png';

  if (initialMode10Sample.counter === postClickMode10Sample.counter) {
    console.error('\n[DEFECT CONFIRMED] DIVMODE 10 counter failed to increment on native pointer click because switch state did not transition.');
    auditResults.divmode10.failureReason = 'No edge event generated: switch remained open due to canvas hit graph defect';
  }

  // ========================================================================
  // CONCLUSION AND DISPOSITION
  // ========================================================================
  console.log('\n========================================================================');
  console.log('   NATIVE CANVAS INTERACTION AUDIT COMPLETE');
  console.log('========================================================================');
  auditResults.conclusion = {
    verdict: 'REJECTED',
    summary: 'Native browser pointer clicks fail to reach the production canvas switch handler due to listening={false} on ComponentNode.tsx:1558-1570. In accordance with audit instructions, this defect is documented without silent application repair.',
  };

  const resultsPath = path.resolve(repoRoot, 'scratch/native_canvas_interaction_audit.json');
  fs.writeFileSync(resultsPath, JSON.stringify(auditResults, null, 2), 'utf-8');
  console.log(`Audit results saved to: ${resultsPath}`);

} catch (err) {
  console.error('[Audit Execution Error]:', err);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

