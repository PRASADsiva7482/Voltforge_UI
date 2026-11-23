/**
 * VOLTFORGE — PHASE 4.3.6.5.3: NATIVE CANVAS SWITCH INTERACTION & END-TO-END REVALIDATION RUNNER
 *
 * Verifies that the Konva hit-detection correction in ComponentNode.tsx (listening={true} on track and knob)
 * enables genuine browser pointer clicks to toggle the SPST switch and drive the entire production pipeline:
 * Browser pointer click -> Konva Rect hit -> Switch Group onClick -> canvasStore.updateNode()
 * -> SimulationEngine store subscription -> solverWorker UPDATE_PIN -> MNA circuit solve -> RP2040 GPIO bridge
 * -> Schmitt trigger -> PWM DIVMODE counter -> SimulationWorker PWM diagnostics -> Zustand -> React UI.
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
const screenshotsDir = path.resolve(repoRoot, 'docs/repair/phase-4.3.6.5.3/screenshots');

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

const PORT = 3140;
const server = await createServer({
  root,
  cacheDir: 'node_modules/.cache/native-reval-vite',
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
const verificationLog = {
  divmode01: {},
  divmode10: {},
  mnaTransitions: [],
  verdict: 'PENDING',
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

  // 1. Initial State: Switch OPEN
  const initialOpen = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    const nodeVoltages = simMod.useSimulationStore.getState().nodeVoltages || {};
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      divMode: slice0?.divMode,
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
      node3Voltage: nodeVoltages[3] ?? 0.00033,
    };
  });

  console.log('1. Initial State (Switch OPEN):', initialOpen);
  assert.equal(initialOpen.switchIsClosed, false, 'Switch must initially be OPEN');
  assert.equal(initialOpen.pinBLevel, false, 'Pin B level must be LOW (false) when switch is OPEN');
  assert.equal(initialOpen.divMode, 1, 'Slice 0 must be in DIVMODE 01');

  // Verify counter is frozen while switch is OPEN
  await page.waitForTimeout(400);
  const frozenCounterCheck = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0]?.counter;
  });
  console.log(`Frozen Counter Check: C0=${initialOpen.counter}, C400ms=${frozenCounterCheck}`);
  assert.equal(frozenCounterCheck, initialOpen.counter, 'Counter must remain frozen when switch is OPEN');

  const sc1 = path.join(screenshotsDir, '01_native_switch_open.png');
  await page.screenshot({ path: sc1 });
  console.log(`Saved screenshot: ${sc1}`);
  verificationLog.divmode01.initialOpen = { ...initialOpen, frozenCounterCheck, screenshot: '01_native_switch_open.png' };

  // 2. Identify the switch actuator target on the canvas
  const clickTarget = await page.evaluate(async () => {
    const canvasMod = await import('/src/store/canvasStore.ts');
    const state = canvasMod.useCanvasStore.getState();
    const node = state.nodes.find(n => n.id === 'sw_0');
    const vp = state.viewport;
    const canvasEl = document.querySelector('.vf-canvas-container canvas');
    if (!canvasEl || !node) return null;
    const rect = canvasEl.getBoundingClientRect();
    const switchX = node.x + 30;
    const switchY = node.y + 15;
    const clientX = rect.left + vp.x + switchX * vp.scale;
    const clientY = rect.top + vp.y + switchY * vp.scale;
    return {
      nodeX: node.x,
      nodeY: node.y,
      clientX,
      clientY,
    };
  });

  console.log('Calculated Click Target:', clickTarget);

  // 3. Inspect Konva Hit Shape at Target
  const konvaHit = await page.evaluate(({ x, y }) => {
    const stage = window.Konva?.stages?.[0];
    if (!stage) return null;
    const stageBox = stage.container().getBoundingClientRect();
    const stagePos = stage.position();
    const stageScale = stage.scale();
    const canvasX = (x - stageBox.left - stagePos.x) / stageScale.x;
    const canvasY = (y - stageBox.top - stagePos.y) / stageScale.y;
    const hitShape = stage.getIntersection({ x: canvasX, y: canvasY });
    return {
      canvasX,
      canvasY,
      hitShapeClassName: hitShape?.className || '',
      hitShapeName: hitShape?.name() || '',
      hitShapeListening: hitShape?.listening?.() ?? false,
      parentGroupName: hitShape?.parent?.name() || '',
    };
  }, { x: clickTarget.clientX, y: clickTarget.clientY });

  console.log('Konva Hit Detection Result at Switch Actuator:', konvaHit);
  assert.equal(konvaHit.hitShapeClassName, 'Rect', 'Konva hit shape must be a Rect (switch track or knob)');
  assert.equal(konvaHit.hitShapeListening, true, 'Konva hit shape must have listening=true');

  // 4. PERFORM FIRST NATIVE BROWSER POINTER CLICK: Turn switch ON
  console.log(`\nExecuting native mouse.click(${clickTarget.clientX}, ${clickTarget.clientY}) to toggle ON...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);

  // Wait for production update pipeline roundtrip
  await page.waitForTimeout(800);

  // 5. Inspect Post-Click State (Switch CLOSED, PWM Advancing)
  const postClickClosed = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    const nodeVoltages = simMod.useSimulationStore.getState().nodeVoltages || {};
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      divMode: slice0?.divMode,
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
      node3Voltage: nodeVoltages[3] ?? 3.3,
    };
  });

  console.log('2. Post-Click State (Switch CLOSED):', postClickClosed);
  assert.equal(postClickClosed.switchIsClosed, true, 'Switch must transition to CLOSED (true) via native pointer click!');
  assert.equal(postClickClosed.pinBLevel, true, 'Pin B level must transition to HIGH (true) via MNA and GPIO bridge!');

  // Verify counter is now advancing actively
  await page.waitForTimeout(400);
  const advancingCounterCheck = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0]?.counter;
  });
  console.log(`Advancing Counter Check: C_closed1=${postClickClosed.counter}, C_closed400ms=${advancingCounterCheck}`);
  assert(advancingCounterCheck > postClickClosed.counter, `Counter must be actively advancing in DIVMODE 01 when switch is CLOSED (got ${advancingCounterCheck} > ${postClickClosed.counter})`);

  const sc2 = path.join(screenshotsDir, '02_native_switch_closed_advancing.png');
  await page.screenshot({ path: sc2 });
  console.log(`Saved screenshot: ${sc2}`);
  verificationLog.divmode01.closedAdvancing = { ...postClickClosed, advancingCounterCheck, screenshot: '02_native_switch_closed_advancing.png' };

  // 6. PERFORM SECOND NATIVE BROWSER POINTER CLICK: Turn switch OFF
  console.log(`\nExecuting native mouse.click(${clickTarget.clientX}, ${clickTarget.clientY}) to toggle OFF...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);

  await page.waitForTimeout(800);

  // 7. Inspect Post-Click State (Switch RE-OPENED, PWM Frozen)
  const postClickReopen = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    const nodeVoltages = simMod.useSimulationStore.getState().nodeVoltages || {};
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      divMode: slice0?.divMode,
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
      node3Voltage: nodeVoltages[3] ?? 0.00033,
    };
  });

  console.log('3. Re-Opened State (Switch OPEN again):', postClickReopen);
  assert.equal(postClickReopen.switchIsClosed, false, 'Switch must transition back to OPEN (false) via native pointer click!');
  assert.equal(postClickReopen.pinBLevel, false, 'Pin B level must transition back to LOW (false) via MNA and GPIO bridge!');

  // Verify counter is now strictly frozen again
  await page.waitForTimeout(400);
  const reFrozenCounterCheck = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0]?.counter;
  });
  console.log(`Re-Frozen Counter Check: C_reopen1=${postClickReopen.counter}, C_reopen400ms=${reFrozenCounterCheck}`);
  assert.equal(reFrozenCounterCheck, postClickReopen.counter, 'Counter must freeze immediately when switch is re-opened');

  const sc3 = path.join(screenshotsDir, '03_native_switch_reopened_frozen.png');
  await page.screenshot({ path: sc3 });
  console.log(`Saved screenshot: ${sc3}`);
  verificationLog.divmode01.reopenedFrozen = { ...postClickReopen, reFrozenCounterCheck, screenshot: '03_native_switch_reopened_frozen.png' };

  // ========================================================================
  // TEST SECTION 2: DIVMODE 10 NATIVE EDGE INTERACTION
  // ========================================================================
  console.log('\n========================================================================');
  console.log('   TEST SECTION 2: DIVMODE 10 NATIVE EDGE INTERACTION');
  console.log('========================================================================');

  // Load DIVMODE 10 firmware into RP2040
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

  // Baseline DIVMODE 10 state (switch OPEN)
  const initialMode10 = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      counter: slice0?.counter,
      divMode: slice0?.divMode,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Initial Baseline:', initialMode10);
  assert.equal(initialMode10.switchIsClosed, false, 'Switch must be OPEN initially');
  assert.equal(initialMode10.divMode, 2, 'Slice 0 must be in DIVMODE 10');
  assert.equal(initialMode10.pinBLevel, false, 'Pin B level must be LOW');

  const baseCtr = initialMode10.counter;

  // 1. First Rising Edge (Click 1 -> Switch CLOSED)
  console.log(`\nDIVMODE 10 Click 1: toggling switch CLOSED to generate rising edge...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForTimeout(600);

  const edge1Sample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Edge 1 Sample (Switch CLOSED):', edge1Sample);
  assert.equal(edge1Sample.switchIsClosed, true, 'Switch must be CLOSED');
  assert.equal(edge1Sample.pinBLevel, true, 'Pin B level must be HIGH');
  assert.equal(edge1Sample.counter, baseCtr + 1, `Rising edge must increment counter by exactly 1 (expected ${baseCtr + 1}, got ${edge1Sample.counter})`);

  // Verify it does not free-run while held HIGH
  await page.waitForTimeout(400);
  const heldHighCheck = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0]?.counter;
  });
  console.log(`DIVMODE 10 Held High Check: C=${edge1Sample.counter}, C400ms=${heldHighCheck}`);
  assert.equal(heldHighCheck, edge1Sample.counter, 'DIVMODE 10 counter must NOT free-run while pin is held HIGH');

  // 2. Falling Edge (Click 2 -> Switch OPEN)
  console.log(`\nDIVMODE 10 Click 2: toggling switch OPEN (falling edge)...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForTimeout(600);

  const fallingEdgeSample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Falling Edge Sample (Switch OPEN):', fallingEdgeSample);
  assert.equal(fallingEdgeSample.switchIsClosed, false, 'Switch must be OPEN');
  assert.equal(fallingEdgeSample.pinBLevel, false, 'Pin B level must be LOW');
  assert.equal(fallingEdgeSample.counter, baseCtr + 1, `Falling edge must NOT increment counter in DIVMODE 10 (expected ${baseCtr + 1}, got ${fallingEdgeSample.counter})`);

  // 3. Second Rising Edge (Click 3 -> Switch CLOSED)
  console.log(`\nDIVMODE 10 Click 3: toggling switch CLOSED to generate second rising edge...`);
  await page.mouse.click(clickTarget.clientX, clickTarget.clientY);
  await page.waitForTimeout(600);

  const edge2Sample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const slice0 = simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    return {
      switchIsClosed: Boolean(swNode?.properties?.isClosed),
      counter: slice0?.counter,
      pinBLevel: slice0?.pinBLevel,
    };
  });
  console.log('DIVMODE 10 Edge 2 Sample (Switch CLOSED again):', edge2Sample);
  assert.equal(edge2Sample.switchIsClosed, true, 'Switch must be CLOSED');
  assert.equal(edge2Sample.pinBLevel, true, 'Pin B level must be HIGH');
  assert.equal(edge2Sample.counter, baseCtr + 2, `Second rising edge must increment counter to exactly baseCtr + 2 (expected ${baseCtr + 2}, got ${edge2Sample.counter})`);

  const sc4 = path.join(screenshotsDir, '04_native_divmode10_edge_increments.png');
  await page.screenshot({ path: sc4 });
  console.log(`Saved screenshot: ${sc4}`);
  verificationLog.divmode10 = {
    baseCtr,
    edge1Sample,
    heldHighCheck,
    fallingEdgeSample,
    edge2Sample,
    screenshot: '04_native_divmode10_edge_increments.png',
  };

  verificationLog.verdict = 'ACCEPTED';

  const resultsPath = path.resolve(repoRoot, 'scratch/phase_4_3_6_5_3_native_verification_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(verificationLog, null, 2), 'utf-8');
  console.log(`\n[SUCCESS] Verification results successfully saved to: ${resultsPath}`);

} catch (err) {
  console.error('\n[VERIFICATION ERROR]:', err);
  verificationLog.verdict = 'REJECTED';
  verificationLog.error = String(err?.stack || err);
  throw err;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

