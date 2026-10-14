import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
});

try {
  const { hydrateCanvasNode, resolveComponentDimensions, isFixedPackageFootprint } = await vite.ssrLoadModule('/src/features/canvas/componentFactory.ts');
  const { componentDimensions } = await vite.ssrLoadModule('/src/features/canvas/componentSvgs.ts');
  const { getPinsForComponent } = await vite.ssrLoadModule('/src/features/canvas/pinRegistry.ts');

  // 1. CD4017 Decade Counter footprint and pin sync
  assert.deepEqual(componentDimensions['IC_CD4017'], { w: 120, h: 50 });
  assert.deepEqual(componentDimensions['CD4017'], { w: 120, h: 50 });

  const cd4017Pins = getPinsForComponent('IC_CD4017');
  assert.equal(cd4017Pins.length, 16);

  // Bottom row: Pins 1 to 8 (q5, q1, q0, q2, q6, q7, q3, gnd)
  const bottomPinIds = ['q5', 'q1', 'q0', 'q2', 'q6', 'q7', 'q3', 'gnd'];
  const expectedLeadX = [16, 28.5, 41, 53.5, 66, 78.5, 91, 103.5];

  for (let i = 0; i < bottomPinIds.length; i += 1) {
    const pin = cd4017Pins.find((p) => p.id === bottomPinIds[i]);
    assert.ok(pin, `Pin ${bottomPinIds[i]} must exist`);
    assert.equal(pin.y, 50, `Pin ${bottomPinIds[i]} y-coordinate must be at bottom lead tip (y=50)`);
    assert.equal(pin.x, expectedLeadX[i], `Pin ${bottomPinIds[i]} x-coordinate must align with lead`);
  }

  // Top row: Pins 9 to 16 (q8, q4, q9, co, clk_inh, clk, reset, vcc)
  const topPinIds = ['q8', 'q4', 'q9', 'co', 'clk_inh', 'clk', 'reset', 'vcc'];
  const expectedTopX = [103.5, 91, 78.5, 66, 53.5, 41, 28.5, 16];

  for (let i = 0; i < topPinIds.length; i += 1) {
    const pin = cd4017Pins.find((p) => p.id === topPinIds[i]);
    assert.ok(pin, `Pin ${topPinIds[i]} must exist`);
    assert.equal(pin.y, 0, `Pin ${topPinIds[i]} y-coordinate must be at top lead tip (y=0)`);
    assert.equal(pin.x, expectedTopX[i], `Pin ${topPinIds[i]} x-coordinate must align with lead`);
  }

  // 2. Package footprint locking prevents stray height / user resizing desync
  assert.ok(isFixedPackageFootprint('IC_CD4017'));
  assert.ok(isFixedPackageFootprint('CD4017'));
  assert.ok(isFixedPackageFootprint('IC_74HC595'));
  assert.ok(isFixedPackageFootprint('IC_555_TIMER'));
  assert.ok(isFixedPackageFootprint('IC_74HC00'));

  // Hydration with legacy/corrupted height (e.g. 80, 90) must lock to canonical 120 x 50
  const legacySeed = {
    id: 'test_cd4017_legacy',
    type: 'IC_CD4017',
    name: 'CD4017 counter',
    x: 820,
    y: 930,
    width: 120,
    height: 80, // Legacy/corrupted height that causes desync
  };
  const hydrated = hydrateCanvasNode(legacySeed);
  assert.equal(hydrated.width, 120, 'Width must lock to canonical 120');
  assert.equal(hydrated.height, 50, 'Height must lock to canonical 50, preventing vertical stretching');

  const q5Pin = hydrated.pins.find((p) => p.id === 'q5');
  assert.equal(q5Pin.y, 50, 'Bottom pins must be at y=50 (lead tip), never inside body');

  const gndPin = hydrated.pins.find((p) => p.id === 'gnd');
  assert.equal(gndPin.y, 50, 'GND pin must be at y=50');

  // 3. Proportional pin scaling fallback for non-locked/scaled nodes
  const canonicalDims = resolveComponentDimensions('CUSTOM_DIP_TEST', { width: 240, height: 100 });
  assert.equal(canonicalDims.w, 240);
  assert.equal(canonicalDims.h, 100);

  // 4. DIP logic IC package family dimensions
  const dip14ICs = ['IC_74HC00', 'IC_74HC04', 'IC_74HC08', 'IC_74HC32', 'IC_74HC86', 'IC_74HC14', 'IC_74HC74', 'IC_74HC02'];
  for (const icType of dip14ICs) {
    assert.deepEqual(componentDimensions[icType], { w: 110, h: 50 }, `${icType} must have canonical { w: 110, h: 50 }`);
    const node = hydrateCanvasNode({ id: `test_${icType}`, type: icType, x: 0, y: 0, height: 90 });
    assert.equal(node.height, 50, `${icType} height must lock to 50`);
    const gnd = node.pins.find((p) => p.id === 'gnd');
    assert.ok(gnd);
    assert.equal(gnd.y, 50, `${icType} gnd pin must be at lead tip (y=50)`);
  }

  console.log('PASS IC package footprint and connector pointer sync contract passed');
} finally {
  await vite.close();
}
