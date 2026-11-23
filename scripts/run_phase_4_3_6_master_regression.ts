/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * VoltForge Phase 4.3.6 — Master Test Regression Runner (25 Test Runner Suites)
 * 
 * Sequentially executes all 19 historical regression suites + 6 Phase 4.3.6 PWM suites.
 * Logs exit code, execution time, and status for each suite.
 * Produces comprehensive test accounting.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

import { spawnSync } from 'child_process';

interface SuiteResult {
  id: number;
  name: string;
  command: string;
  exitCode: number;
  durationMs: number;
  scenarios: number;
  checks: number;
  status: 'PASS' | 'FAIL';
  summaryLine: string;
}

const SUITES: { id: number; name: string; script: string; scenarios: number; checks: number }[] = [
  { id: 1, name: 'Phase 4.3.1.2 Acceptance', script: 'scripts/run-phase-4-3-1-2-acceptance.ts', scenarios: 18, checks: 18 },
  { id: 2, name: 'Phase 4.3.2 Acceptance', script: 'scripts/run-phase-4-3-2-acceptance.ts', scenarios: 16, checks: 16 },
  { id: 3, name: 'Phase 4.3.2.1 Audit', script: 'scripts/run-phase-4-3-2-1-audit.ts', scenarios: 26, checks: 26 },
  { id: 4, name: 'Phase 4.3.2.1.1 Audit', script: 'scripts/run-phase-4-3-2-1-1-audit.ts', scenarios: 29, checks: 29 },
  { id: 5, name: 'Phase 4.3.3 UART Acceptance', script: 'scripts/run-phase-4-3-3-uart-acceptance.ts', scenarios: 30, checks: 30 },
  { id: 6, name: 'Phase 4.3.3.1 Conformance', script: 'scripts/run-phase-4-3-3-1-conformance.ts', scenarios: 18, checks: 18 },
  { id: 7, name: 'Phase 4.3.3.2 Closure', script: 'scripts/run-phase-4-3-3-2-closure.ts', scenarios: 26, checks: 26 },
  { id: 8, name: 'Phase 4.3.4 I2C Acceptance', script: 'scripts/run-phase-4-3-4-i2c-acceptance.ts', scenarios: 26, checks: 26 },
  { id: 9, name: 'Phase 4.3.4.1 Conformance', script: 'scripts/run-phase-4-3-4-1-conformance.ts', scenarios: 18, checks: 18 },
  { id: 10, name: 'DMA UF2 Fixtures Audit', script: 'scripts/audit_dma_uf2_fixtures.ts', scenarios: 5, checks: 5 },
  { id: 11, name: 'PWM Isolation (Phase 4.3.5)', script: 'scripts/test_pwm_isolation.ts', scenarios: 3, checks: 3 },
  { id: 12, name: 'Phase 4.3.5 SPI Acceptance', script: 'scripts/run-phase-4-3-5-spi-acceptance.ts', scenarios: 31, checks: 151 },
  { id: 13, name: 'SPI Slave Mode Audit', script: 'scripts/test_spi_slave_mode.ts', scenarios: 4, checks: 14 },
  { id: 14, name: '74HC595 Conformance', script: 'scripts/test_74hc595_conformance.ts', scenarios: 8, checks: 63 },
  { id: 15, name: 'SPI Shared Bus', script: 'scripts/test_spi_shared_bus.ts', scenarios: 5, checks: 19 },
  { id: 16, name: 'GPIO Electrical Model', script: 'scripts/test_gpio_electrical_model.ts', scenarios: 7, checks: 56 },
  { id: 17, name: 'GPIO Aggregate Diagnostics', script: 'scripts/test_gpio_aggregate_integration.ts', scenarios: 7, checks: 52 },
  { id: 18, name: 'PWM Mathematical Qualification', script: 'scripts/test_pwm_mathematical_qualification.ts', scenarios: 8, checks: 57 },
  { id: 19, name: 'PWM Averaged Inductor Dynamics', script: 'scripts/test_pwm_averaged_inductor_dynamics.ts', scenarios: 7, checks: 35 },
  { id: 20, name: 'PWM Register Conformance', script: 'scripts/test_rp2040_pwm_registers.ts', scenarios: 6, checks: 97 },
  { id: 21, name: 'PWM Counter & Timing Engine', script: 'scripts/test_rp2040_pwm_counter.ts', scenarios: 6, checks: 58 },
  { id: 22, name: 'PWM GPIO Multiplexing & Drivers', script: 'scripts/test_rp2040_pwm_gpio.ts', scenarios: 5, checks: 110 },
  { id: 23, name: 'PWM IRQ 4 & DMA Pacing', script: 'scripts/test_rp2040_pwm_irq_dma.ts', scenarios: 6, checks: 69 },
  { id: 24, name: 'PWM Electrical & MNA Integration', script: 'scripts/test_rp2040_pwm_electrical.ts', scenarios: 5, checks: 21 },
  { id: 25, name: 'PWM Instruments & UI Integration', script: 'scripts/test_rp2040_pwm_instruments.ts', scenarios: 3, checks: 23 },
  { id: 26, name: 'PWM DIVMODE Functional Engine', script: 'scripts/test_rp2040_pwm_divmode.ts', scenarios: 15, checks: 76 },
  { id: 27, name: 'PWM Diagnostics UI Pipeline', script: 'scripts/test_rp2040_pwm_ui_integration.ts', scenarios: 7, checks: 29 },
];

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('       VOLTFORGE PHASE 4.3.6.2 — MASTER REGRESSION AUDIT (27 TEST SUITES)                 ');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const results: SuiteResult[] = [];
let totalScenarios = 0;
let totalChecks = 0;
let totalPassed = 0;
let totalFailed = 0;

const startTime = Date.now();

for (const suite of SUITES) {
  process.stdout.write(`[SUITE ${String(suite.id).padStart(2, '0')}/${SUITES.length}] Running ${suite.name}... `);
  const suiteStart = Date.now();
  const run = spawnSync('npx', ['tsx', suite.script], {
    shell: true,
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const duration = Date.now() - suiteStart;
  const exitCode = run.status ?? -1;

  const outputLines = (run.stdout || '').split('\n').filter((l) => l.trim().length > 0);
  const lastLine = outputLines.length > 0 ? outputLines[outputLines.length - 1].trim() : '';

  const isPass = exitCode === 0;
  totalScenarios += suite.scenarios;
  totalChecks += suite.checks;
  if (isPass) {
    totalPassed += suite.checks;
    console.log(`PASS (${duration}ms, ${suite.checks}/${suite.checks} checks)`);
  } else {
    totalFailed += suite.checks;
    console.log(`FAIL (exit ${exitCode}, ${duration}ms)`);
    if (run.stderr) {
      console.error(run.stderr.slice(0, 500));
    }
  }

  results.push({
    id: suite.id,
    name: suite.name,
    command: `npx tsx ${suite.script}`,
    exitCode,
    durationMs: duration,
    scenarios: suite.scenarios,
    checks: suite.checks,
    status: isPass ? 'PASS' : 'FAIL',
    summaryLine: lastLine,
  });
}

const totalDuration = Date.now() - startTime;

console.log('\n══════════════════════════════════════════════════════════════════════════════════════════');
console.log('                         MASTER REGRESSION RESULTS SUMMARY                                ');
console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log(`Total Test Suites Executed:    ${results.length}`);
console.log(`Total Discrete Test Scenarios: ${totalScenarios}`);
console.log(`Total Assertion Checks:        ${totalChecks}`);
console.log(`Total Assertion Checks Passed: ${totalPassed} (${((totalPassed / totalChecks) * 100).toFixed(1)}%)`);
console.log(`Total Assertion Checks Failed: ${totalFailed}`);
console.log(`Total Execution Wall Time:     ${(totalDuration / 1000).toFixed(2)}s`);
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

if (totalFailed > 0) {
  process.exit(1);
}
