import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createServer } from 'vite';

// Dense reference keeps every row operation, including zero multipliers.
// This is deliberately independent of the production sparse-row shortcut.
function denseSolveLinearSystem(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxVal < 1e-15) return null;
    if (maxRow !== col) {
      [A[col], A[maxRow]] = [A[maxRow], A[col]];
      [b[col], b[maxRow]] = [b[maxRow], b[col]];
    }
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let j = col; j < n; j++) A[row][j] -= factor * A[col][j];
      b[row] -= factor * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(A[row][row]) < 1e-15) return null;
    let sum = b[row];
    for (let j = row + 1; j < n; j++) sum -= A[row][j] * x[j];
    x[row] = sum / A[row][row];
  }
  return x;
}

const moduleUrl = source => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);

async function assertSparseElimination(vite) {
  const dependency = moduleUrl(fs.readFileSync(new URL('../src/features/simulator/mnaIncremental.ts', import.meta.url), 'utf8'));
  const source = fs.readFileSync(new URL('../src/features/simulator/MNASolver.ts', import.meta.url), 'utf8')
    .replace("from './mnaIncremental'", `from ${JSON.stringify(dependency)}`);
  const start = source.indexOf('function solveLinearSystem('), end = source.indexOf('// ── MNA Solver Class');
  assert(start >= 0 && end > start, 'The dense oracle must replace only the linear solver');
  const actual = await import(moduleUrl(source + '\nexport { solveLinearSystem };'));
  const reference = await import(moduleUrl(source.slice(0, start) + denseSolveLinearSystem.toString().replace('denseSolveLinearSystem', 'solveLinearSystem') + '\n' + source.slice(end)));
  const solve = (fn, A, b) => fn(A.map(row => [...row]), [...b]);
  const equalNumber = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b));
  const check = (A, b, residual = false) => {
    const expected = solve(denseSolveLinearSystem, A, b), result = solve(actual.solveLinearSystem, A, b);
    if (!expected) { assert.equal(result, null); return; }
    assert(result && result.length === expected.length);
    assert(result.every((value, index) => equalNumber(value, expected[index])), 'All numeric results must match dense elimination exactly (zero sign is immaterial)');
    if (residual) for (let row = 0; row < A.length; row++) {
      const terms = A[row].map((value, col) => value * result[col]);
      const scale = Math.max(1, Math.abs(b[row]), terms.reduce((sum, term) => sum + Math.abs(term), 0));
      assert(Math.abs(terms.reduce((sum, term) => sum + term, 0) - b[row]) <= scale * 1e-12, 'Independent Ax=b residual');
    }
  };
  let seed = 0x53a9e17, matrices = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const n of [2, 3, 8, 16, 32, 64, 128]) for (const density of [0.02, 0.15, 1]) for (let repeat = 0; repeat < 8; repeat++) {
    const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i !== j && random() < density ? (random() - 0.5) * 20 : 0));
    A.forEach((row, i) => { row[i] = row.reduce((sum, value) => sum + Math.abs(value), 0) + 0.1 + random(); });
    const b = Array.from({ length: n }, () => (random() - 0.5) * 100);
    // Force pivoting while retaining a well-conditioned system.
    if (repeat % 2) { [A[0], A[n - 1]] = [A[n - 1], A[0]]; [b[0], b[n - 1]] = [b[n - 1], b[0]]; }
    check(A, b, true); matrices++;
  }
  for (const [A, b] of [
    [[[1, 2], [2, 4]], [3, 6]], // singular
    [[[0, 0], [0, 0]], [0, 0]],
    [[[0, 1], [1, 0]], [2, 3]], // voltage-source constraint / row swap
    [[[1, 1], [1e-20, 1]], [1e20, 0]], // tiny nonzero factors must execute
    [[[1, 0], [Number.MIN_VALUE, 1]], [1, 0]],
    [[[1, -0], [-0, 1]], [-0, 0]],
    [[[1, Infinity], [0, 1]], [2, 3]],
    [[[1, 2], [0, 1]], [Infinity, 3]],
    [[[1, NaN], [0, 1]], [2, 3]],
    [[[1, 1e308], [-1, 1e308]], [1, 1]], // overflow during elimination
  ]) { check(A, b); matrices++; }
  assert.equal(solve(actual.solveLinearSystem, [[1, 1], [1e-20, 1]], [1e20, 0])[1], -1);

  const { createMaximumComponentRegressionPreset } = await vite.ssrLoadModule('/src/store/maxComponentRegressionPreset.ts');
  const { buildMNACircuit } = await vite.ssrLoadModule('/src/features/simulator/NetlistBuilder.ts');
  const fixture = createMaximumComponentRegressionPreset();
  const circuit = buildMNACircuit(fixture.nodes, fixture.wires, {}, {}, {});
  const originals = [structuredClone(circuit.elements), structuredClone(circuit.elements)];
  const solvers = [new reference.MNASolver(circuit.numNodes, .001), new actual.MNASolver(circuit.numNodes, .001)];
  solvers.forEach((solver, i) => solver.setElements(originals[i]));
  for (let step = 0; step < 128; step++) {
    for (let i = 0; i < solvers.length; i++) {
      // Reproduce ordered pin edges, parameter changes and timestep changes.
      for (const element of originals[i]) {
        if (element.id.startsWith('vs_mcu_') && element.id.endsWith('_src')) element.value = (step + element.id.length) % 7 < 3 ? 5 : 0;
        if (element.type === 'MOTOR_DC') element.backEmf = step % 5 * .2;
      }
      if (step === 32) solvers[i].updateElementValues([{ id: 'r_max_resistor_1', changes: { value: 777 } }]);
      if (step === 64) solvers[i].setTimeStep(.005);
    }
    const expected = solvers[0].solve(), result = solvers[1].solve();
    assert.deepEqual(result, expected, 'Voltages, currents, convergence and iteration count must match at step ' + step);
    solvers[0].updateTransientState(expected); solvers[1].updateTransientState(result);
    assert.deepEqual(originals[1], originals[0], 'Transient state must match at step ' + step);
  }
  // The mixed preset does not contain every controlled-source stamp. Cover
  // these separately because their matrix pivots are not resistor-like.
  const supply = { id: 'supply', type: 'VOLTAGE_SOURCE', nodeA: 1, nodeB: 0, value: 5 };
  const load = { id: 'load', type: 'RESISTOR', nodeA: 2, nodeB: 0, value: 1000 };
  const control = { id: 'control', type: 'VOLTAGE_SOURCE', nodeA: 3, nodeB: 0, value: .65 };
  const pullup = { id: 'pullup', type: 'RESISTOR', nodeA: 1, nodeB: 2, value: 1000 };
  const families = [
    [supply, load, { id: 'meter', type: 'AMMETER', nodeA: 1, nodeB: 2, value: 0 }],
    [load, { id: 'current', type: 'CURRENT_SOURCE', nodeA: 0, nodeB: 2, value: .001 }],
    [supply, load, { id: 'transformer', type: 'TRANSFORMER', nodeA: 1, nodeB: 0, controlNode: 2, controlNode2: 0, value: .2, secondaryInductance: .8, coupling: .98, turnsRatio: 2 }],
    [supply, control, pullup, { id: 'bjt', type: 'BJT', nodeA: 2, nodeB: 0, controlNode: 3, value: 1, gain: 100 }],
    [supply, control, load, { id: 'pnp', type: 'BJT', nodeA: 2, nodeB: 1, controlNode: 3, value: 1, gain: 100, pnp: true }],
    [supply, control, pullup, { id: 'mosfet', type: 'MOSFET', nodeA: 2, nodeB: 0, controlNode: 3, value: 1, thresholdVoltage: 1 }],
    [supply, control, load, { id: 'pmos', type: 'MOSFET', nodeA: 2, nodeB: 1, controlNode: 3, value: 1, thresholdVoltage: 1, pChannel: true }],
    [supply, control, load, { id: 'opamp', type: 'OPAMP', nodeA: 2, nodeB: 0, controlNode: 3, controlNode2: 2, positiveRailNode: 1, negativeRailNode: 0, value: 1, openLoopGain: 1000 }],
  ];
  let controlledSolves = 0;
  for (const family of families) for (const dt of [1e-5, .001, .005]) {
    const elements = [structuredClone(family), structuredClone(family)];
    const pair = [new reference.MNASolver(3, dt), new actual.MNASolver(3, dt)];
    pair.forEach((solver, i) => solver.setElements(elements[i]));
    for (let step = 0; step < 24; step++) {
      for (const models of elements) for (const element of models) {
        if (element.id === 'control') element.value = step % 6;
        if (element.id === 'supply') element.value = step < 12 ? 5 : 3.3;
      }
      const expected = pair[0].solve(), result = pair[1].solve();
      assert.deepEqual(result, expected, `Controlled-source results at ${family.at(-1).id}:${dt}:${step}`);
      assert(result.nodeVoltages.every(Number.isFinite));
      pair[0].updateTransientState(expected); pair[1].updateTransientState(result);
      assert.deepEqual(elements[1], elements[0]); controlledSolves++;
    }
  }
  console.log(`MNA sparse elimination: ${matrices} dense-oracle matrices (168 with residual checks); 128 mixed-circuit and ${controlledSolves} controlled-source solves with identical results and transient state`);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
});

try {
  const regression = await vite.ssrLoadModule('/src/features/simulator/regression/mnaIncrementalRegression.ts');
  regression.assertIncrementalMnaContract();
  console.log('incremental MNA contract: topology, patch, history, and lifecycle assertions passed');
  await assertSparseElimination(vite);
} finally {
  await vite.close();
}
