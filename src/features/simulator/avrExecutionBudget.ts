import type { SimulationFidelityMode } from './simulationModels';

export interface AvrExecutionBudgetConfig {
  cpuFrequencyHz: number;
  framePeriodMs: number;
  sliceBudgetMs: number;
  maxFrameDeltaMs: number;
  maxPendingCycles: number;
  timeCheckInstructionInterval: number;
  maxInstructionsPerSlice: number;
  telemetryPeriodMs: number;
}

export interface AvrInstructionRuntime {
  now: () => number;
  readCycles: () => number;
  executeInstruction: () => void;
  tickPeripheral: () => void;
}

export interface AvrExecutionFrameInput {
  frameTimestampMs: number;
  paused: boolean;
  powered: boolean;
  speed: number;
}

export interface AvrExecutionTelemetry {
  sampledAtMs: number;
  windowMs: number;
  averageSliceMs: number;
  maximumSliceMs: number;
  maximumDeadlineOvershootMs: number;
  mainThreadUtilizationPercent: number;
  instructionsPerSecond: number;
  emulatedClockHz: number;
  pendingCycleLagMs: number;
  budgetLimited: boolean;
  hardLimitReached: boolean;
  backgroundStallCount: number;
}

export interface AvrExecutionFrameResult {
  rawFrameDeltaMs: number;
  accountedFrameDeltaMs: number;
  discardedFrameDeltaMs: number;
  accruedCycles: number;
  executedInstructions: number;
  executedCycles: number;
  pendingCycles: number;
  cycleCarry: number;
  pendingCycleLagMs: number;
  sliceTimeMs: number;
  deadlineOvershootMs: number;
  budgetLimited: boolean;
  deadlineReached: boolean;
  hardLimitReached: boolean;
  backgroundStall: boolean;
  timingRebased: boolean;
  telemetry: AvrExecutionTelemetry | null;
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

/**
 * Deterministic AVR cycle/deadline policy shared by the production engine and
 * regression fixtures. Signed cycle carry preserves instruction totals across
 * different requestAnimationFrame partitions without ever reordering a CPU
 * instruction and its matching peripheral tick.
 */
export class AvrExecutionBudgetScheduler {
  private readonly config: AvrExecutionBudgetConfig;
  private cycleCarry = 0;
  private lastFrameTimestampMs: number | null = null;
  private rebaseNextFrame = false;
  private previousPaused = false;
  private previousPowered: boolean | null = null;
  private telemetryWindowStartMs: number | null = null;
  private telemetryInstructions = 0;
  private telemetryCycles = 0;
  private telemetrySliceTimeMs = 0;
  private telemetrySliceCount = 0;
  private telemetryMaximumSliceMs = 0;
  private telemetryMaximumDeadlineOvershootMs = 0;
  private telemetryBudgetLimited = false;
  private telemetryHardLimitReached = false;
  private telemetryBackgroundStallCount = 0;

  constructor(config: AvrExecutionBudgetConfig) {
    this.config = {
      cpuFrequencyHz: finiteNonNegative(config.cpuFrequencyHz),
      framePeriodMs: finiteNonNegative(config.framePeriodMs),
      sliceBudgetMs: finiteNonNegative(config.sliceBudgetMs),
      maxFrameDeltaMs: finiteNonNegative(config.maxFrameDeltaMs),
      maxPendingCycles: finiteNonNegative(config.maxPendingCycles),
      timeCheckInstructionInterval: positiveInteger(config.timeCheckInstructionInterval, 1),
      maxInstructionsPerSlice: positiveInteger(config.maxInstructionsPerSlice, 1),
      telemetryPeriodMs: finiteNonNegative(config.telemetryPeriodMs),
    };
  }

  /** Clear all execution and telemetry history for a new CPU generation. */
  reset(frameTimestampMs?: number): void {
    this.cycleCarry = 0;
    this.lastFrameTimestampMs = Number.isFinite(frameTimestampMs) ? frameTimestampMs! : null;
    this.rebaseNextFrame = false;
    this.previousPaused = false;
    this.previousPowered = null;
    this.resetTelemetry(Number.isFinite(frameTimestampMs) ? frameTimestampMs! : null);
  }

  /** Pause/power/visibility time must never become firmware catch-up debt. */
  suspend(frameTimestampMs: number): void {
    this.cycleCarry = 0;
    this.lastFrameTimestampMs = finiteNonNegative(frameTimestampMs);
    this.rebaseNextFrame = true;
    this.resetTelemetry(this.lastFrameTimestampMs);
  }

  /** Rebase the next active frame after pause without advancing emulated time. */
  resume(frameTimestampMs: number): void {
    this.cycleCarry = 0;
    this.lastFrameTimestampMs = finiteNonNegative(frameTimestampMs);
    this.rebaseNextFrame = true;
    this.resetTelemetry(this.lastFrameTimestampMs);
  }

  get pendingCycles(): number {
    return Math.max(0, this.cycleCarry);
  }

  runFrame(input: AvrExecutionFrameInput, runtime: AvrInstructionRuntime): AvrExecutionFrameResult {
    const frameTimestampMs = finiteNonNegative(input.frameTimestampMs);
    const rawFrameDeltaMs = this.lastFrameTimestampMs === null
      ? this.config.framePeriodMs
      : Math.max(0, frameTimestampMs - this.lastFrameTimestampMs);
    this.lastFrameTimestampMs = frameTimestampMs;

    const becameActive = this.rebaseNextFrame || this.previousPaused || this.previousPowered === false;
    this.previousPaused = input.paused;
    this.previousPowered = input.powered;

    if (input.paused || !input.powered) {
      this.cycleCarry = 0;
      this.rebaseNextFrame = true;
      this.resetTelemetry(frameTimestampMs);
      return this.idleResult(rawFrameDeltaMs, becameActive);
    }

    let timingRebased = false;
    let backgroundStall = false;
    let accountedFrameDeltaMs = rawFrameDeltaMs;
    if (becameActive) {
      accountedFrameDeltaMs = 0;
      timingRebased = true;
      this.rebaseNextFrame = false;
    } else if (rawFrameDeltaMs > this.config.maxFrameDeltaMs) {
      // A throttled/background tab is not real firmware time. Resume with one
      // normal frame instead of generating a stale multi-frame catch-up burst.
      accountedFrameDeltaMs = this.config.framePeriodMs;
      backgroundStall = true;
    } else {
      accountedFrameDeltaMs = Math.min(rawFrameDeltaMs, this.config.maxFrameDeltaMs);
    }

    const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 1;
    const accruedCycles = accountedFrameDeltaMs * this.config.cpuFrequencyHz / 1000 * speed;
    this.cycleCarry = Math.min(this.config.maxPendingCycles, this.cycleCarry + accruedCycles);

    const sliceStartMs = runtime.now();
    let executedInstructions = 0;
    let executedCycles = 0;
    let deadlineReached = false;

    while (this.cycleCarry > 0 && executedInstructions < this.config.maxInstructionsPerSlice) {
      const cyclesBefore = runtime.readCycles();
      runtime.executeInstruction();
      runtime.tickPeripheral();
      const instructionCycles = Math.max(1, runtime.readCycles() - cyclesBefore);
      executedCycles += instructionCycles;
      executedInstructions += 1;
      // Retain a small negative carry when the final instruction crosses the
      // target. The next frame compensates it, making totals partition-stable.
      this.cycleCarry -= instructionCycles;

      if (
        executedInstructions % this.config.timeCheckInstructionInterval === 0
        && runtime.now() - sliceStartMs >= this.config.sliceBudgetMs
      ) {
        deadlineReached = true;
        break;
      }
    }

    const sliceTimeMs = Math.max(0, runtime.now() - sliceStartMs);
    const hardLimitReached = this.cycleCarry > 0
      && executedInstructions >= this.config.maxInstructionsPerSlice;
    const budgetLimited = this.cycleCarry > 0 && (deadlineReached || hardLimitReached);
    const deadlineOvershootMs = Math.max(0, sliceTimeMs - this.config.sliceBudgetMs);
    const pendingCycles = Math.max(0, this.cycleCarry);
    const pendingCycleLagMs = this.config.cpuFrequencyHz > 0
      ? pendingCycles / this.config.cpuFrequencyHz * 1000
      : 0;

    this.recordTelemetry({
      backgroundStall,
      budgetLimited,
      deadlineOvershootMs,
      executedCycles,
      executedInstructions,
      hardLimitReached,
      sliceTimeMs,
    });

    return {
      rawFrameDeltaMs,
      accountedFrameDeltaMs,
      discardedFrameDeltaMs: Math.max(0, rawFrameDeltaMs - accountedFrameDeltaMs),
      accruedCycles,
      executedInstructions,
      executedCycles,
      pendingCycles,
      cycleCarry: this.cycleCarry,
      pendingCycleLagMs,
      sliceTimeMs,
      deadlineOvershootMs,
      budgetLimited,
      deadlineReached,
      hardLimitReached,
      backgroundStall,
      timingRebased,
      telemetry: this.takeTelemetry(frameTimestampMs, pendingCycleLagMs),
    };
  }

  private idleResult(rawFrameDeltaMs: number, timingRebased: boolean): AvrExecutionFrameResult {
    return {
      rawFrameDeltaMs,
      accountedFrameDeltaMs: 0,
      discardedFrameDeltaMs: rawFrameDeltaMs,
      accruedCycles: 0,
      executedInstructions: 0,
      executedCycles: 0,
      pendingCycles: 0,
      cycleCarry: 0,
      pendingCycleLagMs: 0,
      sliceTimeMs: 0,
      deadlineOvershootMs: 0,
      budgetLimited: false,
      deadlineReached: false,
      hardLimitReached: false,
      backgroundStall: false,
      timingRebased,
      telemetry: null,
    };
  }

  private recordTelemetry(frame: {
    backgroundStall: boolean;
    budgetLimited: boolean;
    deadlineOvershootMs: number;
    executedCycles: number;
    executedInstructions: number;
    hardLimitReached: boolean;
    sliceTimeMs: number;
  }): void {
    this.telemetryInstructions += frame.executedInstructions;
    this.telemetryCycles += frame.executedCycles;
    this.telemetrySliceTimeMs += frame.sliceTimeMs;
    this.telemetrySliceCount += 1;
    this.telemetryMaximumSliceMs = Math.max(this.telemetryMaximumSliceMs, frame.sliceTimeMs);
    this.telemetryMaximumDeadlineOvershootMs = Math.max(
      this.telemetryMaximumDeadlineOvershootMs,
      frame.deadlineOvershootMs,
    );
    this.telemetryBudgetLimited ||= frame.budgetLimited;
    this.telemetryHardLimitReached ||= frame.hardLimitReached;
    if (frame.backgroundStall) this.telemetryBackgroundStallCount += 1;
  }

  private takeTelemetry(nowMs: number, pendingCycleLagMs: number): AvrExecutionTelemetry | null {
    if (this.telemetryWindowStartMs === null) {
      this.telemetryWindowStartMs = nowMs;
      return null;
    }
    const windowMs = nowMs - this.telemetryWindowStartMs;
    if (windowMs < this.config.telemetryPeriodMs) return null;

    const telemetry: AvrExecutionTelemetry = {
      sampledAtMs: nowMs,
      windowMs,
      averageSliceMs: this.telemetrySliceCount > 0
        ? this.telemetrySliceTimeMs / this.telemetrySliceCount
        : 0,
      maximumSliceMs: this.telemetryMaximumSliceMs,
      maximumDeadlineOvershootMs: this.telemetryMaximumDeadlineOvershootMs,
      mainThreadUtilizationPercent: windowMs > 0
        ? Math.min(100, this.telemetrySliceTimeMs / windowMs * 100)
        : 0,
      instructionsPerSecond: windowMs > 0 ? this.telemetryInstructions * 1000 / windowMs : 0,
      emulatedClockHz: windowMs > 0 ? this.telemetryCycles * 1000 / windowMs : 0,
      pendingCycleLagMs,
      budgetLimited: this.telemetryBudgetLimited,
      hardLimitReached: this.telemetryHardLimitReached,
      backgroundStallCount: this.telemetryBackgroundStallCount,
    };
    this.resetTelemetry(nowMs);
    return telemetry;
  }

  private resetTelemetry(startedAtMs: number | null): void {
    this.telemetryWindowStartMs = startedAtMs;
    this.telemetryInstructions = 0;
    this.telemetryCycles = 0;
    this.telemetrySliceTimeMs = 0;
    this.telemetrySliceCount = 0;
    this.telemetryMaximumSliceMs = 0;
    this.telemetryMaximumDeadlineOvershootMs = 0;
    this.telemetryBudgetLimited = false;
    this.telemetryHardLimitReached = false;
    this.telemetryBackgroundStallCount = 0;
  }
}

export function avrSliceBudgetForMode(
  fidelityMode: SimulationFidelityMode,
  model: {
    cpuFrequency_Hz: number;
    adaptiveFrameBudget_ms: number;
    fullFidelityFrameBudget_ms: number;
    adaptiveMaxCatchUp_ms: number;
    fullFidelityMaxCatchUp_ms: number;
    maxFrameDelta_ms: number;
    timeCheckInstructionInterval: number;
    maxInstructionsPerSlice: number;
    telemetryPeriod_ms: number;
  },
  framePeriodMs: number,
): AvrExecutionBudgetConfig {
  const sliceBudgetMs = fidelityMode === 'full-fidelity'
    ? model.fullFidelityFrameBudget_ms
    : model.adaptiveFrameBudget_ms;
  const maxCatchUpMs = fidelityMode === 'full-fidelity'
    ? model.fullFidelityMaxCatchUp_ms
    : model.adaptiveMaxCatchUp_ms;
  return {
    cpuFrequencyHz: model.cpuFrequency_Hz,
    framePeriodMs,
    sliceBudgetMs,
    maxFrameDeltaMs: model.maxFrameDelta_ms,
    maxPendingCycles: model.cpuFrequency_Hz * maxCatchUpMs / 1000,
    timeCheckInstructionInterval: model.timeCheckInstructionInterval,
    maxInstructionsPerSlice: model.maxInstructionsPerSlice,
    telemetryPeriodMs: model.telemetryPeriod_ms,
  };
}
