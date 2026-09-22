import {
  AvrExecutionBudgetScheduler,
  avrSliceBudgetForMode,
  type AvrExecutionBudgetConfig,
  type AvrInstructionRuntime,
} from '../avrExecutionBudget';
import { SIMULATION_MODELS } from '../simulationModels';
import { AvrRuntimeTraceCollector, evaluateAvrPeripheralCoverage } from '../avrRuntimeTrace';
import type { AvrWorkloadSnapshot } from '../../../store/simulationStore';
import {
  AVR_COMPILED_TRACE_FIRMWARE,
  captureAvrCompiledFirmwareMode,
  createAvrCompiledFirmwareFixture,
} from './avrCompiledFirmwareTrace';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AVR execution budget regression failed: ${message}`);
}

interface RuntimeFixture {
  runtime: AvrInstructionRuntime;
  events: string[];
  getCycles: () => number;
}

function createRuntimeFixture(cyclePattern: number[], instructionWallMs: number): RuntimeFixture {
  let cycles = 0;
  let instructions = 0;
  let nowMs = 0;
  const events: string[] = [];
  return {
    events,
    getCycles: () => cycles,
    runtime: {
      now: () => nowMs,
      readCycles: () => cycles,
      executeInstruction: () => {
        const sequence = instructions;
        events.push(`instruction:${sequence}`);
        cycles += cyclePattern[sequence % cyclePattern.length];
        instructions += 1;
        nowMs += instructionWallMs;
      },
      tickPeripheral: () => events.push(`tick:${instructions - 1}`),
    },
  };
}

function config(overrides: Partial<AvrExecutionBudgetConfig> = {}): AvrExecutionBudgetConfig {
  return {
    cpuFrequencyHz: 1_000,
    framePeriodMs: 10,
    sliceBudgetMs: 100,
    maxFrameDeltaMs: 50,
    maxPendingCycles: 1_000,
    timeCheckInstructionInterval: 4,
    maxInstructionsPerSlice: 1_000,
    telemetryPeriodMs: 200,
    ...overrides,
  };
}

function assertDeadlineAndHardCeiling(): void {
  const deadlineRuntime = createRuntimeFixture([1], 0.3);
  const deadlineScheduler = new AvrExecutionBudgetScheduler(config({
    framePeriodMs: 100,
    sliceBudgetMs: 1,
  }));
  const deadline = deadlineScheduler.runFrame({
    frameTimestampMs: 0,
    paused: false,
    powered: true,
    speed: 1,
  }, deadlineRuntime.runtime);
  assert(deadline.deadlineReached, 'the synthetic expensive slice must reach its wall-time deadline');
  assert(deadline.executedInstructions === 4, 'deadline must be checked at the configured four-instruction boundary');
  assert(deadline.deadlineOvershootMs <= 4 * 0.3 + 1e-9, 'deadline overshoot must fit within one bounded check block');
  assert(deadline.budgetLimited && deadline.pendingCycles > 0, 'remaining cycle debt must be retained after a deadline yield');

  const hardRuntime = createRuntimeFixture([1], 0);
  const hardScheduler = new AvrExecutionBudgetScheduler(config({
    framePeriodMs: 100,
    maxInstructionsPerSlice: 5,
    timeCheckInstructionInterval: 100,
  }));
  const hard = hardScheduler.runFrame({
    frameTimestampMs: 0,
    paused: false,
    powered: true,
    speed: 1,
  }, hardRuntime.runtime);
  assert(hard.executedInstructions === 5, 'hard instruction safety ceiling must be exact');
  assert(hard.hardLimitReached && hard.budgetLimited, 'hard ceiling must report retained budget-limited debt');
}

function assertOrderingAndPartitionIndependence(): void {
  const run = (timestamps: number[]) => {
    const fixture = createRuntimeFixture([1, 2, 3, 4], 0);
    const scheduler = new AvrExecutionBudgetScheduler(config());
    let executedCycles = 0;
    let executedInstructions = 0;
    for (const frameTimestampMs of timestamps) {
      const frame = scheduler.runFrame({
        frameTimestampMs,
        paused: false,
        powered: true,
        speed: 1,
      }, fixture.runtime);
      executedCycles += frame.executedCycles;
      executedInstructions += frame.executedInstructions;
    }
    return { ...fixture, executedCycles, executedInstructions, pendingCycles: scheduler.pendingCycles };
  };

  const partitioned = run([0, 10, 20, 30, 40]);
  const combined = run([0, 40]);
  assert(partitioned.executedCycles === combined.executedCycles, 'cycle totals must not depend on frame partitioning');
  assert(partitioned.executedInstructions === combined.executedInstructions, 'instruction totals must not depend on frame partitioning');
  assert(partitioned.pendingCycles === combined.pendingCycles, 'retained cycle debt must be partition-independent');
  assert(partitioned.events.join('|') === combined.events.join('|'), 'instruction/peripheral event order must be partition-independent');
  for (let index = 0; index < partitioned.events.length; index += 2) {
    assert(partitioned.events[index]?.startsWith('instruction:'), 'each event pair must begin with an instruction');
    assert(partitioned.events[index + 1]?.startsWith('tick:'), 'each instruction must be followed by exactly one peripheral tick');
  }
}

function assertLifecycleRebasing(): void {
  const fixture = createRuntimeFixture([1], 0);
  const scheduler = new AvrExecutionBudgetScheduler(config());
  const run = (frameTimestampMs: number, paused: boolean, powered: boolean) => scheduler.runFrame({
    frameTimestampMs,
    paused,
    powered,
    speed: 1,
  }, fixture.runtime);

  assert(run(0, false, true).executedCycles === 10, 'initial active frame must execute one reference frame');
  scheduler.suspend(10);
  assert(run(10_000, true, true).executedCycles === 0, 'paused background time must execute no cycles');
  scheduler.resume(10_000);
  const resumed = run(10_000, false, true);
  assert(resumed.timingRebased && resumed.executedCycles === 0, 'resume frame must rebase without catch-up');
  assert(run(10_010, false, true).executedCycles === 10, 'post-resume execution must restart from fresh frame time');

  assert(run(20_000, false, false).executedCycles === 0, 'board power-off must clear and execute no debt');
  const powered = run(20_000, false, true);
  assert(powered.timingRebased && powered.executedCycles === 0, 'power-on frame must not inherit powered-off time');
  assert(run(20_010, false, true).executedCycles === 10, 'powered firmware must resume from retained CPU state on fresh time');

  const stalled = run(30_000, false, true);
  assert(stalled.backgroundStall, 'large requestAnimationFrame delta must be classified as a background stall');
  assert(stalled.accountedFrameDeltaMs === 10, 'background stall must account for one normal frame, not stale wall time');
  assert(stalled.executedCycles === 10, 'background recovery must not generate a stale catch-up burst');

  const restartedFixture = createRuntimeFixture([1], 0);
  const restarted = new AvrExecutionBudgetScheduler(config()).runFrame({
    frameTimestampMs: 0,
    paused: false,
    powered: true,
    speed: 1,
  }, restartedFixture.runtime);
  assert(restarted.executedCycles === 10, 'a new CPU generation must start without prior scheduler debt');
}

function assertTelemetryCadenceAndModes(): void {
  const fixture = createRuntimeFixture([1], 0.01);
  const scheduler = new AvrExecutionBudgetScheduler(config());
  let publications = 0;
  let latestInstructionsPerSecond = 0;
  for (let frameTimestampMs = 0; frameTimestampMs <= 1_000; frameTimestampMs += 10) {
    const result = scheduler.runFrame({
      frameTimestampMs,
      paused: false,
      powered: true,
      speed: 1,
    }, fixture.runtime);
    if (result.telemetry) {
      publications += 1;
      latestInstructionsPerSecond = result.telemetry.instructionsPerSecond;
      assert(result.telemetry.windowMs >= 200, 'telemetry must represent a complete throttled window');
      assert(result.telemetry.emulatedClockHz > 0, 'telemetry must expose emulated cycle rate');
      assert(result.telemetry.mainThreadUtilizationPercent >= 0, 'telemetry must expose main-thread utilization');
    }
  }
  assert(publications === 5, 'one-second run must publish exactly five 200 ms telemetry windows, not one update per frame');
  assert(latestInstructionsPerSecond > 0, 'throttled telemetry must expose instruction throughput');

  const framePeriodMs = SIMULATION_MODELS.clock.framePeriod_s * 1000;
  const adaptive = avrSliceBudgetForMode('adaptive', SIMULATION_MODELS.avr, framePeriodMs);
  const full = avrSliceBudgetForMode('full-fidelity', SIMULATION_MODELS.avr, framePeriodMs);
  assert(adaptive.sliceBudgetMs === 4 && full.sliceBudgetMs === 8, 'Adaptive and Full fidelity must retain documented 4/8 ms deadlines');
  assert(adaptive.maxPendingCycles < full.maxPendingCycles, 'Full fidelity may retain a larger bounded catch-up window');
  assert(adaptive.maxInstructionsPerSlice === full.maxInstructionsPerSlice, 'both modes must retain the same hard safety ceiling');
}

function assertPeripheralEvidenceContract(): void {
  const trace = new AvrRuntimeTraceCollector();
  trace.start();
  trace.recordPinTransition('13');
  trace.recordPinTransition('13');
  for (let index = 0; index < 4; index += 1) trace.recordPinTransition('3');
  for (let index = 0; index < 3; index += 1) trace.recordUartByte();
  trace.recordAdcConversion();
  trace.recordI2cEvent('start');
  trace.recordI2cEvent('connect');
  trace.recordI2cEvent('write');
  trace.recordI2cEvent('stop');
  const snapshot = trace.read(12_345);
  const checks = evaluateAvrPeripheralCoverage(snapshot);
  assert(snapshot.cpuCycles === 12_345, 'runtime evidence must retain the exact CPU cycle total');
  assert(checks.length === 5 && checks.every((check) => check.passed), 'GPIO, timer/PWM, UART, ADC, and I2C evidence must be independently classified');
  trace.stop();
  trace.recordUartByte();
  assert(trace.read(12_345).uartTransmittedBytes === 3, 'disabled instrumentation must add no further trace events');
}

async function assertBrowserTraceHarness(): Promise<void> {
  const fixture = createAvrCompiledFirmwareFixture();
  assert(fixture.nodes.some((node) => node.type === 'ARDUINO_UNO'), 'compiled trace fixture must contain an ATmega328P-compatible board');
  assert(fixture.nodes.some((node) => node.type === 'DISPLAY_LCD_I2C'), 'compiled trace fixture must contain an I2C target');
  for (const firmwareCall of ['digitalWrite(', 'analogWrite(', 'analogRead(', 'Serial.', 'Wire.']) {
    assert(AVR_COMPILED_TRACE_FIRMWARE.includes(firmwareCall), `compiled trace firmware must exercise ${firmwareCall}`);
  }

  let nowMs = 0;
  let frameId = 0;
  const workload: AvrWorkloadSnapshot = {
    active: true,
    fidelityMode: 'adaptive',
    sliceBudgetMs: 4,
    averageSliceMs: 2.5,
    maximumSliceMs: 4.2,
    maximumDeadlineOvershootMs: 0.2,
    mainThreadUtilizationPercent: 15,
    instructionsPerSecond: 1_200_000,
    emulatedClockHz: 2_400_000,
    pendingCycleLagMs: 1.5,
    budgetLimited: true,
    hardLimitReached: false,
    backgroundStallCount: 0,
  };
  const trace = await captureAvrCompiledFirmwareMode('adaptive', {
    now: () => nowMs,
    requestFrame: (callback) => {
      const id = ++frameId;
      queueMicrotask(() => {
        nowMs += 16;
        callback(nowMs);
      });
      return id;
    },
    scheduleInputProbe: (callback) => {
      nowMs += 2;
      callback();
    },
    getWorkload: () => workload,
    getPeripheralSnapshot: () => ({
      cpuCycles: 48_000,
      pinTransitions: { '13': 3, '3': 8 },
      uartTransmittedBytes: 12,
      adcConversions: 2,
      i2cStarts: 2,
      i2cStops: 2,
      i2cConnections: 2,
      i2cWrites: 4,
      i2cReads: 0,
    }),
    shouldStop: () => false,
  }, 64);

  assert(trace.completed && trace.responsive, 'controlled browser trace must complete and meet responsiveness targets');
  assert(trace.frameTime.count > 0 && trace.frameTime.p95Ms === 18, 'requestAnimationFrame deltas must include controlled input work');
  assert(trace.inputLatency.count === 1 && trace.inputLatency.p95Ms === 2, 'input latency must use the injected performance clock');
  assert(trace.workload.budgetLimitedObserved, 'browser trace must retain budget-limited telemetry evidence');
  assert(trace.peripheralChecks.every((check) => check.passed), 'browser trace must retain all compiled peripheral evidence');
}

export async function assertAvrExecutionBudgetContract(): Promise<void> {
  assertDeadlineAndHardCeiling();
  assertOrderingAndPartitionIndependence();
  assertLifecycleRebasing();
  assertTelemetryCadenceAndModes();
  assertPeripheralEvidenceContract();
  await assertBrowserTraceHarness();
}
