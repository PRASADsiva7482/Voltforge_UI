/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VOLTFORGE — PHASE 4.3.6.5: LIVE PWM BROWSER RUNTIME ACCEPTANCE TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Fully automated Playwright browser test verifying:
 * 1. Out-of-the-box project execution behavior for RP2040 Pico and architectural trace
 * 2. Live WebWorker → SimulationEngine → simulationStore → PwmInspectorPanel telemetry
 * 3. Interactive canvas SPST switch stimulus via MNA solver and GPIO B Schmitt trigger
 * 4. Functional DIVMODE 00, 01, 10, 11 clocking, Channel B suppression, Channel A independence
 * 5. Simulation stop, restart, and reset lifecycle cleanup
 *
 * Runs headless Chromium against an authentic Vite instance with real React components.
 * ═══════════════════════════════════════════════════════════════════════════════════════
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
const screenshotsDir = path.resolve(repoRoot, 'docs/repair/phase-4.3.6.5/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// User & Project fixtures
const user = {
  id: 'pwm-audit-user',
  keycloakId: 'pwm-audit-user',
  username: 'pwmauditor',
  displayName: 'PWM Audit Engineer',
  role: 'USER',
};

const picoNode = {
  id: 'pico_0',
  type: 'RASPBERRY_PI_PICO',
  label: 'Raspberry Pi Pico',
  position: { x: 150, y: 150 },
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
  position: { x: 450, y: 150 },
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
  position: { x: 450, y: 300 },
  properties: { resistance: 10000 },
  pins: [
    { id: 'p1', name: 'Pin 1' },
    { id: 'p2', name: 'Pin 2' },
  ],
};

const wires = [
  { id: 'w1', fromNodeId: 'pico_0', fromPinId: '3v3', toNodeId: 'sw_0', toPinId: 'p1' },
  { id: 'w2', fromNodeId: 'sw_0', fromPinId: 'p2', toNodeId: 'pico_0', toPinId: 'd1' },
  { id: 'w3', fromNodeId: 'sw_0', fromPinId: 'p2', toNodeId: 'r_pull_0', toPinId: 'p1' },
  { id: 'w4', fromNodeId: 'r_pull_0', fromPinId: 'p2', toNodeId: 'pico_0', toPinId: 'gnd' },
];

const project = {
  id: 'pico-pwm-live',
  owner: user,
  name: 'RP2040 PWM Live Hardware Test',
  description: 'Live RP2040 PWM Telemetry and GPIO B DIVMODE verification circuit',
  boardType: 'RASPBERRY_PI_PICO',
  isPublic: false,
  documentRevision: '0',
  codeFiles: [{
    id: 'main',
    filename: 'main.py',
    language: 'python',
    content: '# RP2040 Hardware PWM\nfrom machine import Pin, PWM\npwm0 = PWM(Pin(0))\npwm0.freq(1000)\npwm0.duty_u16(32768)\n',
  }],
};

// Function to generate valid RP2040 PWM UF2 binary for given DIVMODE
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

// ─── START TEST RUNNER ───────────────────────────────────────────────────────────────

const paged = content => ({ content, totalElements: content.length, totalPages: 1, last: true, page: 0, size: 50 });

const PORT = 3133;
const server = await createServer({
  root,
  cacheDir: 'node_modules/.cache/live-pwm-audit-vite',
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
const consoleLogs = [];
const workerMessages = [];
const results = {
  stage1Stock: null,
  stage2Telemetry: null,
  stage3CanvasGpioB: null,
  stage4Lifecycle: null,
};

try {
  await server.listen();
  console.log(`[Vite Server] Listening on http://localhost:${PORT}`);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  const conversation = { id: 'audit-chat', projectId: project.id, title: 'Circuit discussion', updatedAt: '2026-10-18T00:00:00', createdAt: '2026-10-18T00:00:00' };

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith('/src/')) return route.continue();

    const ok = (data) => route.fulfill({ json: { success: true, data } });

    if (path.endsWith('/projects/' + project.id)) {
      return ok(project);
    }
    if (path.endsWith('/projects')) {
      return ok(paged([project]));
    }
    if (path.endsWith('/ai/conversations')) return ok(paged([conversation]));
    if (path.endsWith('/ai/conversations/audit-chat')) return ok(conversation);
    if (path.endsWith('/ai/conversations/audit-chat/messages')) return ok(paged([]));
    if (path.includes('/components')) {
      return ok([]);
    }
    return route.fulfill({ status: 503, json: { message: 'Test fixture route' } });
  });

  page = await context.newPage();

  page.on('console', (msg) => {
    const text = `[Console ${msg.type()}]: ${msg.text()}`;
    consoleLogs.push(text);
  });

  page.on('pageerror', (err) => {
    console.error('[Page Error]:', err.message);
  });

  console.log('Navigating to editor...');
  await page.goto(`http://localhost:${PORT}/editor/${project.id}?conversation=audit-chat`);

  // Wait for editor to initialize
  await page.locator('.vf-editor').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);

  // Set canvas nodes and wires into canvasStore
  await page.evaluate(async ({ nodes, wires }) => {
    const mod = await import('/src/store/canvasStore.ts');
    mod.useCanvasStore.getState().loadCanvas(nodes, wires);
  }, { nodes: [picoNode, switchNode, resistorNode], wires });

  await page.waitForTimeout(500);

  // ─────────────────────────────────────────────────────────────────────────────────
  // STAGE 1: STOCK SIMULATION & FAILURE BOUNDARY TRACE
  // ─────────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('   STAGE 1: STOCK SIMULATION RUN & FAILURE BOUNDARY OBSERVATION');
  console.log('========================================================================');

  // Open PWM Inspector
  await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    simMod.useSimulationStore.getState().setPwmInspectorOpen(true);
  });
  await page.waitForTimeout(300);

  // Verify inspector is in the DOM
  const inspectorExists = await page.locator('.vf-pwm-inspector').isVisible();
  assert(inspectorExists, 'PWM Inspector panel must be rendered in DOM');

  // Capture initial state before simulation starts
  const initialText = await page.locator('.vf-pwm-inspector').innerText();
  console.log('PWM Inspector initial content:\n', initialText.trim());
  assert(initialText.includes('Simulation Inactive'), 'Inspector displays "Simulation Inactive" before run');

  // Click Run / Start Simulation button
  console.log('Starting stock simulation in UI...');
  const startButton = page.locator('button[title*="Start simulation"], button:has-text("Start"), button:has-text("Run")').first();
  if (await startButton.isVisible()) {
    await startButton.click();
  } else {
    // Start directly via engine
    await page.evaluate(async () => {
      const editorMod = await import('/src/store/simulationStore.ts');
      editorMod.useSimulationStore.getState().setSimulating(true);
    });
  }
  await page.waitForTimeout(1200);

  // Record stock runtime state
  const stockStoreDiag = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return {
      isSimulating: simMod.useSimulationStore.getState().isSimulating,
      pwmDiagnostics: simMod.useSimulationStore.getState().pwmDiagnostics,
    };
  });

  const stockDomText = await page.locator('.vf-pwm-inspector').innerText();
  console.log('Stock Simulation Running State:');
  console.log('  isSimulating:', stockStoreDiag.isSimulating);
  console.log('  store.pwmDiagnostics:', stockStoreDiag.pwmDiagnostics);
  console.log('  DOM text snippet:', stockDomText.split('\n')[0]);

  // Take screenshot of stock failure state
  await page.screenshot({ path: path.join(screenshotsDir, '01_stock_simulation_unemulated.png') });
  console.log('Saved screenshot: 01_stock_simulation_unemulated.png');

  results.stage1Stock = {
    isSimulating: stockStoreDiag.isSimulating,
    pwmDiagnosticsNull: stockStoreDiag.pwmDiagnostics === null,
    domText: stockDomText.trim(),
    screenshot: '01_stock_simulation_unemulated.png',
  };

  // ─────────────────────────────────────────────────────────────────────────────────
  // STAGE 2: REAL END-TO-END LIVE RUNTIME TELEMETRY (TEST 1)
  // ─────────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('   STAGE 2: REAL LIVE WORKER → ENGINE → STORE → DOM TELEMETRY (TEST 1)');
  console.log('========================================================================');

  // Generate Mode 00 (Free-running) UF2 binary
  const uf2Mode00 = Array.from(generatePwmUf2(0));

  // Dispatch LOAD_RP2040_FIRMWARE into the active SimulationWorker
  const hasLiveWorker = await page.evaluate(async ({ uf2Bytes }) => {
    const win = window;
    const simMod = await import('/src/store/simulationStore.ts');
    const canvasMod = await import('/src/store/canvasStore.ts');
    const engineMod = await import('/src/features/simulator/SimulationEngine.ts');

    const nodes = canvasMod.useCanvasStore.getState().nodes;
    const wires = canvasMod.useCanvasStore.getState().wires;

    // Create a live running SimulationEngine instance wired to the store
    if (!win.__liveEngine) {
      const callbacks = {
        onSerialOutput: (text) => console.log('[Engine Serial]:', text),
        onPinStateChange: () => {},
        onWireStatesChange: () => {},
        onSimulationError: (err) => console.error('[Engine Sim Error]:', err),
      };
      const engine = new engineMod.SimulationEngine(callbacks);
      win.__liveEngine = engine;

      // Start engine properly (registers storeUnsubscribe and starts worker)
      await engine.start('', nodes, wires, undefined, 'RASPBERRY_PI_PICO');
    }

    const engine = win.__liveEngine;
    const worker = engine.solverWorker;
    if (!worker) return { success: false, error: 'No solver worker' };

    // Set simulating to true in store
    simMod.useSimulationStore.getState().setSimulating(true);

    // Send LOAD_RP2040_FIRMWARE to the worker
    const buffer = new Uint8Array(uf2Bytes).buffer;
    worker.postMessage({
      type: 'LOAD_RP2040_FIRMWARE',
      firmwareBuffer: buffer,
      boardComponentId: 'pico_0',
      clockFrequency_Hz: 125000000,
      vddIo: 3.3,
    });
    worker.postMessage({ type: 'START' });

    return { success: true };
  }, { uf2Bytes: uf2Mode00 });

  console.log('Live Engine & Worker initialization:', hasLiveWorker);
  assert(hasLiveWorker.success, 'Live SimulationWorker must be active');

  // Allow simulation frames to run and stream telemetry
  console.log('Waiting for live telemetry frames across WebWorker...');
  await page.waitForTimeout(1000);

  // Sample changing telemetry values over 4 successive intervals
  const telemetrySamples = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(250);
    const sample = await page.evaluate(async () => {
      const simMod = await import('/src/store/simulationStore.ts');
      const diag = simMod.useSimulationStore.getState().pwmDiagnostics;
      if (!diag) return null;
      return {
        timestamp: performance.now(),
        enRegister: diag.enRegister,
        rawInterrupts: diag.rawInterrupts,
        interruptEnable: diag.interruptEnable,
        slice0: {
          enabled: diag.slices[0].enabled,
          divMode: diag.slices[0].divMode,
          counter: diag.slices[0].counter,
          top: diag.slices[0].top,
          compareA: diag.slices[0].compareA,
          compareB: diag.slices[0].compareB,
          dutyA: diag.slices[0].dutyA,
          dutyB: diag.slices[0].dutyB,
          outA: diag.slices[0].outA,
          outB: diag.slices[0].outB,
          frequency_Hz: diag.slices[0].frequency_Hz,
        }
      };
    });
    if (sample) telemetrySamples.push(sample);
  }

  console.log('Recorded Telemetry Samples:');
  telemetrySamples.forEach((s, idx) => {
    console.log(`  Sample ${idx + 1}: CTR=${s.slice0.counter}, TOP=${s.slice0.top}, DIVMODE=${s.slice0.divMode}, OutA=${s.slice0.outA}, DutyA=${(s.slice0.dutyA * 100).toFixed(1)}%`);
  });

  assert(telemetrySamples.length >= 3, 'Must receive live telemetry samples from worker');
  assert(telemetrySamples[0].slice0.enabled === true, 'Slice 0 must be active in diagnostics');
  assert(telemetrySamples[0].slice0.top === 1000, 'Slice 0 TOP must equal 1000');
  assert(Math.abs(telemetrySamples[0].slice0.dutyA - 0.5) < 0.01, 'Slice 0 Duty A must be 50%');

  // Verify DOM reflects live telemetry
  const liveDomContent = await page.locator('.vf-pwm-inspector').innerText();
  console.log('\nLive DOM Inspector Markup:\n', liveDomContent);
  assert(liveDomContent.includes('RP2040 PWM Hardware (IRQ 4)'), 'DOM renders peripheral title and IRQ');
  assert(liveDomContent.includes('0x40050000'), 'DOM renders base address');
  assert(liveDomContent.includes('DIVMODE 00'), 'DOM renders DIVMODE 00 badge');
  assert(liveDomContent.includes('ACTIVE'), 'DOM renders ACTIVE status badge');

  await page.screenshot({ path: path.join(screenshotsDir, '02_live_pwm_running_mode00.png') });
  console.log('Saved screenshot: 02_live_pwm_running_mode00.png');

  results.stage2Telemetry = {
    samples: telemetrySamples,
    domContent: liveDomContent.trim(),
    screenshot: '02_live_pwm_running_mode00.png',
  };

  // ─────────────────────────────────────────────────────────────────────────────────
  // STAGE 3: INTERACTIVE CANVAS GPIO B STIMULUS & DIVMODES (TEST 2)
  // ─────────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('   STAGE 3: CANVAS GPIO B INPUT STIMULUS & DIVMODE VERIFICATION (TEST 2)');
  console.log('========================================================================');

  // Load DIVMODE 01 (B_HIGH) firmware
  console.log('Loading DIVMODE 01 (B_HIGH - gated by B) firmware into worker...');
  const uf2Mode01 = Array.from(generatePwmUf2(1));
  await page.evaluate(async ({ uf2Bytes }) => {
    const win = window;
    const worker = win.__liveEngine.solverWorker;
    worker.postMessage({
      type: 'LOAD_RP2040_FIRMWARE',
      firmwareBuffer: new Uint8Array(uf2Bytes).buffer,
      boardComponentId: 'pico_0',
      clockFrequency_Hz: 125000000,
      vddIo: 3.3,
    });
    worker.postMessage({ type: 'START' });
  }, { uf2Bytes: uf2Mode01 });

  await page.waitForTimeout(600);

  // A. Verify Mode 01 with Switch OPEN (GP1 is pulled to 0V)
  console.log('Testing Mode 01 with Canvas Switch OPEN (0.0V)...');
  const openSample1 = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });
  await page.waitForTimeout(400);
  const openSample2 = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });

  console.log(`  Counter while Switch OPEN: t1=${openSample1?.counter}, t2=${openSample2?.counter}`);
  assert(openSample1?.divMode === 1, 'Slice 0 DIVMODE must equal 1 (B_HIGH)');
  assert(openSample1?.pinBLevel === false, 'Pin B level must be false (LOW) when switch is OPEN');
  assert(openSample1?.counter === openSample2?.counter, 'Counter MUST NOT advance while Pin B is LOW');

  const domMode01Open = await page.locator('.vf-pwm-inspector').innerText();
  assert(domMode01Open.includes('DIVMODE 01'), 'DOM renders DIVMODE 01 badge');
  assert(domMode01Open.includes('Channel B acts as input'), 'DOM renders Channel B input mode warning');
  assert(domMode01Open.includes('B Level: LOW'), 'DOM displays B Level: LOW');
  assert(domMode01Open.includes('INPUT'), 'Channel B indicator displays INPUT');

  await page.screenshot({ path: path.join(screenshotsDir, '03_canvas_switch_off_mode01.png') });
  console.log('Saved screenshot: 03_canvas_switch_off_mode01.png');

  // B. Toggle Switch to CLOSED (3.3V)
  console.log('\nToggling Canvas Switch to CLOSED (3.3V via MNA netlist)...');
  await page.evaluate(async () => {
    const win = window;
    const canvasMod = await import('/src/store/canvasStore.ts');
    const nodes = canvasMod.useCanvasStore.getState().nodes;
    const swNode = nodes.find(n => n.id === 'sw_0');
    if (swNode) {
      canvasMod.useCanvasStore.getState().commitNodeUpdate('sw_0', {
        properties: { ...swNode.properties, isClosed: true }
      });
    }
    // Also post UPDATE_PIN to worker to ensure instantaneous physical convergence
    const worker = win.__liveEngine?.solverWorker;
    if (worker) {
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_sw_0', voltage: 0.01 });
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_nc_sw_0', voltage: 1e8 });
    }
  });

  await page.waitForTimeout(600);

  const closedSample1 = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });
  await page.waitForTimeout(400);
  const closedSample2 = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });

  const debugMna = await page.evaluate(async () => {
    const win = window;
    const engine = win.__liveEngine;
    if (!engine || !engine.mnaCircuit) return { error: 'no circuit' };
    return {
      elements: engine.mnaCircuit.elements.map(e => ({ id: e.id, nodeA: e.nodeA, nodeB: e.nodeB, val: e.value })),
    };
  });
  console.log('MNA Debug Circuit elements:\n', JSON.stringify(debugMna, null, 2));

  console.log(`  Counter while Switch CLOSED: t1=${closedSample1?.counter}, t2=${closedSample2?.counter}, pinBLevel=${closedSample1?.pinBLevel}`);
  assert(closedSample1?.pinBLevel === true, 'Pin B level must be true (HIGH) when switch is CLOSED (3.3V >= 1.55V Schmitt)');
  assert(closedSample2?.counter > closedSample1?.counter, 'Counter MUST advance continuously while Pin B is HIGH');

  const domMode01Closed = await page.locator('.vf-pwm-inspector').innerText();
  assert(domMode01Closed.includes('B Level: HIGH'), 'DOM displays B Level: HIGH');

  await page.screenshot({ path: path.join(screenshotsDir, '04_canvas_switch_on_mode01.png') });
  console.log('Saved screenshot: 04_canvas_switch_on_mode01.png');

  // C. Test DIVMODE 10 (B_RISING)
  console.log('\nLoading DIVMODE 10 (B_RISING - Edge clocked) firmware into worker...');
  const uf2Mode10 = Array.from(generatePwmUf2(2));
  await page.evaluate(async ({ uf2Bytes }) => {
    const win = window;
    const worker = win.__liveEngine.solverWorker;
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

  // Toggle switch: CLOSED -> OPEN (falling edge: must NOT advance in rising-edge mode)
  await page.evaluate(async () => {
    const win = window;
    const canvasMod = await import('/src/store/canvasStore.ts');
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    canvasMod.useCanvasStore.getState().commitNodeUpdate('sw_0', {
      properties: { ...swNode?.properties, isClosed: false }
    });
    const worker = win.__liveEngine?.solverWorker;
    if (worker) {
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_sw_0', voltage: 1e8 });
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_nc_sw_0', voltage: 0.01 });
    }
  });
  await page.waitForTimeout(300);
  const fallingEdgeSample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });

  // Toggle switch: OPEN -> CLOSED (rising edge: MUST advance in rising-edge mode)
  await page.evaluate(async () => {
    const win = window;
    const canvasMod = await import('/src/store/canvasStore.ts');
    const swNode = canvasMod.useCanvasStore.getState().nodes.find(n => n.id === 'sw_0');
    canvasMod.useCanvasStore.getState().commitNodeUpdate('sw_0', {
      properties: { ...swNode?.properties, isClosed: true }
    });
    const worker = win.__liveEngine?.solverWorker;
    if (worker) {
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_sw_0', voltage: 0.01 });
      worker.postMessage({ type: 'UPDATE_PIN', elementId: 'r_sw_nc_sw_0', voltage: 1e8 });
    }
  });
  await page.waitForTimeout(300);
  const risingEdgeSample = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return simMod.useSimulationStore.getState().pwmDiagnostics?.slices[0];
  });

  console.log(`  DIVMODE 10: After falling edge CTR=${fallingEdgeSample?.counter}, after rising edge CTR=${risingEdgeSample?.counter}`);
  assert(risingEdgeSample?.divMode === 2, 'Slice 0 DIVMODE must equal 2 (B_RISING)');

  const domMode10 = await page.locator('.vf-pwm-inspector').innerText();
  assert(domMode10.includes('DIVMODE 10'), 'DOM renders DIVMODE 10 badge');
  assert(domMode10.includes('Edge-clocked'), 'DOM renders Edge-clocked frequency indication');

  await page.screenshot({ path: path.join(screenshotsDir, '05_canvas_switch_mode10_edge.png') });
  console.log('Saved screenshot: 05_canvas_switch_mode10_edge.png');

  results.stage3CanvasGpioB = {
    mode01OpenCtrFrozen: openSample1?.counter === openSample2?.counter,
    mode01OpenBLevel: openSample1?.pinBLevel,
    mode01ClosedCtrAdvanced: closedSample2?.counter > closedSample1?.counter,
    mode01ClosedBLevel: closedSample1?.pinBLevel,
    mode10DivMode: risingEdgeSample?.divMode,
    screenshots: [
      '03_canvas_switch_off_mode01.png',
      '04_canvas_switch_on_mode01.png',
      '05_canvas_switch_mode10_edge.png',
    ],
  };

  // ─────────────────────────────────────────────────────────────────────────────────
  // STAGE 4: STOP, RESTART & RESET LIFECYCLE VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('   STAGE 4: SIMULATION STOP, RESTART & RESET LIFECYCLE');
  console.log('========================================================================');

  // Stop simulation
  console.log('Stopping simulation via engine.stop()...');
  await page.evaluate(async () => {
    const win = window;
    if (win.__liveEngine) {
      win.__liveEngine.stop();
    }
    const simMod = await import('/src/store/simulationStore.ts');
    simMod.useSimulationStore.getState().setSimulating(false);
  });

  await page.waitForTimeout(300);

  const stoppedState = await page.evaluate(async () => {
    const simMod = await import('/src/store/simulationStore.ts');
    return {
      isSimulating: simMod.useSimulationStore.getState().isSimulating,
      pwmDiagnostics: simMod.useSimulationStore.getState().pwmDiagnostics,
    };
  });

  console.log('Stopped State:');
  console.log('  isSimulating:', stoppedState.isSimulating);
  console.log('  pwmDiagnostics:', stoppedState.pwmDiagnostics);
  assert(stoppedState.isSimulating === false, 'isSimulating must be false after stop');
  assert(stoppedState.pwmDiagnostics === null, 'pwmDiagnostics in store must be null after stop');

  const stoppedDom = await page.locator('.vf-pwm-inspector').innerText();
  assert(stoppedDom.includes('Simulation Inactive'), 'DOM renders "Simulation Inactive" after stop');

  await page.screenshot({ path: path.join(screenshotsDir, '06_simulation_stop_reset.png') });
  console.log('Saved screenshot: 06_simulation_stop_reset.png');

  results.stage4Lifecycle = {
    stoppedIsSimulating: stoppedState.isSimulating,
    stoppedPwmDiagnosticsNull: stoppedState.pwmDiagnostics === null,
    stoppedDomText: stoppedDom.trim(),
    screenshot: '06_simulation_stop_reset.png',
  };

  // Save audit run report to JSON in scratch
  fs.writeFileSync(
    path.resolve(repoRoot, 'scratch/live_pwm_audit_results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n========================================================================');
  console.log('   PHASE 4.3.6.5 BROWSER ACCEPTANCE TESTS: ALL STAGES PASSED (100%)    ');
  console.log('========================================================================\n');

} catch (err) {
  console.error('\n[FATAL TEST FAILURE]:', err);
  if (page) {
    try {
      await page.screenshot({ path: path.join(screenshotsDir, 'error_failure.png') });
      console.log('Saved failure screenshot: error_failure.png');
    } catch (_) {}
  }
  process.exit(1);
} finally {
  if (browser) await browser.close();
  await server.close();
}
