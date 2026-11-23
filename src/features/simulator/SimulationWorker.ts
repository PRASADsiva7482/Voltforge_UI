// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation WebWorker
// Runs the MNA solver off the main thread. Receives circuit definitions and
// MCU pin states, solves within an explicit wall-clock budget, and posts the
// latest completed state once per worker frame.
// ═══════════════════════════════════════════════════════════════════════════

import { MNASolver } from './MNASolver';
import type { MNAElement, MNAElementValueUpdate } from './MNASolver';
import {
  SIMULATION_MODELS,
  selectAdaptiveTimeStep,
  solverCostProfile,
  sourceVoltageAtTime,
  type SimulationFidelityMode,
} from './simulationModels';
import type { SolverDiagnosticsSnapshot } from './solverDiagnostics';
import { SOLVER_DIAGNOSTICS_SAMPLE_INTERVAL_MS } from './solverDiagnostics';
import { resultTransferables, type ResultSubscription } from './resultSubscription';
import { WorkerBackpressureGate } from './workerBackpressure';
import { replaceMnaElementsPreservingTransientState } from './mnaIncremental';
import { ScopeCaptureBuffer, scopeBatchTransferables } from './scopeCapture';
import { RP2040Controller, type Rp2040ExecutionSnapshot, type Rp2040StepResult } from './rp2040Controller';
import type { Rp2040BoardConfig, Rp2040VectorTable } from './uf2Parser';
import type { Rp2040PinDriverState } from './rp2040GpioBridge';
import type { PwmDiagnostics } from './rp2040Pwm';

// ── Message types ───────────────────────────────────────────────────────

/**
 * The engine requests only the values needed by active UI consumers. IDs are
 * kept as strings for stable mapping; numeric measurements travel in compact
 * typed arrays and are transferred without copying.
 */
export interface WorkerResultSubscription extends ResultSubscription {}

export interface WorkerInitMessage {
  type: 'INIT';
  numNodes: number;
  elements: MNAElement[];
  dt: number;
  fidelityMode?: SimulationFidelityMode;
  resultSubscription?: WorkerResultSubscription;
  scopeChannels?: Record<string, number>;
  scopeSampleInterval_s?: number;
  scopeCaptureRevision?: number;
  telemetryGenerationId?: number;
}

export interface WorkerUpdatePinMessage {
  type: 'UPDATE_PIN';
  elementId: string;
  voltage: number;
}

export interface WorkerUpdateSourceMessage {
  type: 'UPDATE_SOURCE';
  elementId: string;
  voltage: number;
  waveform?: MNAElement['waveform'];
}

export interface WorkerUpdateElementsMessage {
  type: 'UPDATE_ELEMENTS';
  numNodes: number;
  elements: MNAElement[];
  resultSubscription?: WorkerResultSubscription;
  scopeChannels?: Record<string, number>;
}

export interface WorkerUpdateElementValuesMessage {
  type: 'UPDATE_ELEMENT_VALUES';
  updates: MNAElementValueUpdate[];
}

export interface WorkerSetScopeChannelsMessage {
  type: 'SET_SCOPE_CHANNELS';
  scopeChannels: Record<string, number>;
}

export interface WorkerSetScopeConfigMessage {
  type: 'SET_SCOPE_CONFIG';
  sampleInterval_s: number;
  revision: number;
}

export interface WorkerStartMessage {
  type: 'START';
  telemetryGenerationId?: number;
}

export interface WorkerStopMessage {
  type: 'STOP';
}

export interface WorkerPauseMessage { type: 'PAUSE'; }
export interface WorkerResumeMessage { type: 'RESUME'; }
export interface WorkerStepMessage { type: 'STEP'; }
export interface WorkerSetSpeedMessage { type: 'SET_SPEED'; speed: number; }

export interface WorkerSetTimeStepMessage {
  type: 'SET_TIMESTEP';
  dt: number;
}

export interface WorkerSetResultSubscriptionMessage {
  type: 'SET_RESULT_SUBSCRIPTION';
  subscription: WorkerResultSubscription;
}

/** One presentation credit from the main thread. */
export interface WorkerRequestResultMessage {
  type: 'REQUEST_RESULT';
}

export interface WorkerLoadRp2040FirmwareMessage {
  type: 'LOAD_RP2040_FIRMWARE';
  firmwareBuffer: ArrayBuffer;
  boardConfig?: Rp2040BoardConfig;
  clockFrequency_Hz?: number;
  boardComponentId?: string;
  vddIo?: number;
  telemetryGenerationId?: number;
}

export interface WorkerRp2040StepMessage {
  type: 'RP2040_STEP';
  instructions?: number;
  cycles?: number;
}

export interface WorkerRp2040ResetMessage {
  type: 'RP2040_RESET';
  telemetryGenerationId?: number;
}

export interface WorkerRp2040GetSnapshotMessage {
  type: 'RP2040_GET_SNAPSHOT';
}

export interface WorkerRp2040LoadResultMessage {
  type: 'RP2040_LOAD_RESULT';
  success: boolean;
  vectorTable: Rp2040VectorTable | null;
  errors: string[];
  warnings: string[];
}

export interface WorkerRp2040StepResultMessage extends Rp2040StepResult {
  type: 'RP2040_STEP_RESULT';
}

export interface WorkerRp2040SnapshotMessage {
  type: 'RP2040_SNAPSHOT';
  snapshot: Rp2040ExecutionSnapshot;
}

export interface WorkerSerialOutputMessage {
  type: 'SERIAL_OUTPUT';
  text: string;
  simulatedTime_s: number;
  uartIndex: number;
  baudRate: number;
}

export interface WorkerSerialInputMessage {
  type: 'SERIAL_INPUT';
  text: string;
  uartIndex?: number;
}

export type WorkerInMessage =
  | WorkerInitMessage
  | WorkerUpdatePinMessage
  | WorkerUpdateSourceMessage
  | WorkerUpdateElementsMessage
  | WorkerUpdateElementValuesMessage
  | WorkerSetScopeChannelsMessage
  | WorkerSetScopeConfigMessage
  | WorkerStartMessage
  | WorkerStopMessage
  | WorkerPauseMessage
  | WorkerResumeMessage
  | WorkerStepMessage
  | WorkerSetSpeedMessage
  | WorkerSetTimeStepMessage
  | WorkerRequestResultMessage
  | WorkerSetResultSubscriptionMessage
  | WorkerLoadRp2040FirmwareMessage
  | WorkerRp2040StepMessage
  | WorkerRp2040ResetMessage
  | WorkerRp2040GetSnapshotMessage
  | WorkerSerialInputMessage;

export function isValidTelemetryGenerationId(gen: unknown): gen is number {
  return typeof gen === 'number' && Number.isInteger(gen) && gen > 0;
}

export interface WorkerResultMessage {
  type: 'RESULT';
  nodeIndices: number[];
  nodeVoltages: Float64Array;
  branchCurrentElementIds?: string[];
  branchCurrents?: Float64Array;
  powerElementIds?: string[];
  componentPower?: Float64Array;
  componentApparentPower?: Float64Array;
  converged: boolean;
  timestamp: number;
  timeStep: number;
  stepsThisFrame: number;
  fidelityMode: SimulationFidelityMode;
  behavioralStates?: Record<string, boolean>;
  diagnostics?: SolverDiagnosticsSnapshot;
  rp2040GpioStates?: Rp2040PinDriverState[];
  pwmDiagnostics?: PwmDiagnostics;
  rp2040Snapshot?: Rp2040ExecutionSnapshot;
}

export interface WorkerOscilloscopeMessage {
  type: 'OSCILLOSCOPE';
  channelIds: string[];
  timestamps: Float64Array;
  /** Row-major samples: sample index × channel count + channel index. */
  values: Float64Array;
  samplePeriodMs: number;
  captureRevision: number;
  timestamp: number;
}

export type WorkerOutMessage =
  | WorkerResultMessage
  | WorkerOscilloscopeMessage
  | WorkerRp2040LoadResultMessage
  | WorkerRp2040StepResultMessage
  | WorkerRp2040SnapshotMessage
  | WorkerSerialOutputMessage
  | { type: 'RP2040_RESET_COMPLETE'; telemetryGenerationId?: number }
  | { type: 'RP2040_RESET_ERROR'; error: string };

// ── Worker Logic ────────────────────────────────────────────────────────

let solver: MNASolver | null = null;
let elements: MNAElement[] = [];
let running = false;
let paused = false;
let speed = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let simTime = 0;
let solverNodeCount = 0;
let requestedTimeStep: number = SIMULATION_MODELS.clock.defaultTimeStep_s;
let fidelityMode: SimulationFidelityMode = 'adaptive';
let lastBehavioralStates: Record<string, boolean> = {};
let latestResult: ReturnType<MNASolver['solve']> | null = null;
let rp2040Controller: RP2040Controller | null = null;
let resultSubscription: WorkerResultSubscription | null = null;
const backpressureGate = new WorkerBackpressureGate();
let completedSteps = 0;
let diagnosticsWindowStartedAtMs = Number.NaN;
let diagnosticsWindowStartedSimulationTime = 0;
let diagnosticsWindowWallTimeMs = 0;
let diagnosticsWindowFrames = 0;
let diagnosticsWindowBudgetLimited = false;
let latestDiagnostics: SolverDiagnosticsSnapshot | null = null;
let currentTelemetryGenerationId = 1;
let lastTelemetryPostTime_ms = 0;
const TELEMETRY_INTERVAL_MS = 100;

// Scope channels are named by the canvas instrument, not by anonymous MNA
// node indexes. This keeps CH1/CH2 stable when the netlist is rebuilt.
let scopeChannels: Record<string, number> = {};
let scopeChannelIds: string[] = [];
const scopeCapture = new ScopeCaptureBuffer(SIMULATION_MODELS.scope.pendingSampleCapacity);

function setScopeChannels(nextChannels: Record<string, number>) {
  scopeChannels = { ...nextChannels };
  scopeChannelIds = Object.keys(scopeChannels).sort();
  scopeCapture.configureChannels(scopeChannelIds.length);
}

function setScopeSampleInterval(sampleInterval_s?: number, revision = scopeCapture.revision) {
  scopeCapture.configureTiming(sampleInterval_s, revision);
}

function captureScopeSample(
  result: ReturnType<MNASolver['solve']>,
  force = false,
) {
  if (!scopeCapture.isCaptureDue(simTime, force)) return;

  const sampleValues = new Float64Array(scopeChannelIds.length);
  scopeChannelIds.forEach((channelId, channelIndex) => {
    const nodeIndex = scopeChannels[channelId];
    sampleValues[channelIndex] = nodeIndex > 0 && nodeIndex < result.nodeVoltages.length
      ? result.nodeVoltages[nodeIndex]
      : 0;
  });
  scopeCapture.capture(simTime, sampleValues, force);
}

function drainScopeBatch(): WorkerOscilloscopeMessage | null {
  const batch = scopeCapture.drain(solver?.getTimeStep());
  if (!batch) return null;
  const { timestamps, values, samplePeriodMs, captureRevision } = batch;
  const message: WorkerOscilloscopeMessage = {
    type: 'OSCILLOSCOPE',
    channelIds: [...scopeChannelIds],
    timestamps,
    values,
    samplePeriodMs,
    captureRevision,
    timestamp: timestamps[timestamps.length - 1],
  };
  return message;
}

function setResultSubscription(subscription?: WorkerResultSubscription) {
  resultSubscription = subscription
    ? {
        nodeIndices: [...new Set(subscription.nodeIndices.filter((index) => Number.isInteger(index) && index >= 0))],
        branchCurrentElementIds: [...new Set(subscription.branchCurrentElementIds)],
        powerElementIds: [...new Set(subscription.powerElementIds)],
        diagnosticsEnabled: subscription.diagnosticsEnabled === true,
        rp2040TelemetryEnabled: subscription.rp2040TelemetryEnabled === true,
      }
    : null;

  if (!resultSubscription?.diagnosticsEnabled) {
    diagnosticsWindowStartedAtMs = Number.NaN;
    diagnosticsWindowStartedSimulationTime = simTime;
    diagnosticsWindowWallTimeMs = 0;
    diagnosticsWindowFrames = 0;
    diagnosticsWindowBudgetLimited = false;
    latestDiagnostics = null;
  }
}

function recordDiagnostics(
  frameStartMs: number,
  frameWallTimeMs: number,
  stepsThisFrame: number,
  budgetMs: number,
  budgetLimited: boolean,
  converged: boolean,
) {
  if (!resultSubscription?.diagnosticsEnabled) return;

  const sampledAtMs = performance.now();
  if (!Number.isFinite(diagnosticsWindowStartedAtMs)) {
    diagnosticsWindowStartedAtMs = frameStartMs;
    diagnosticsWindowStartedSimulationTime = simTime - stepsThisFrame * (solver?.getTimeStep() || 0);
  }
  diagnosticsWindowWallTimeMs += Math.max(0, frameWallTimeMs);
  diagnosticsWindowFrames += 1;
  diagnosticsWindowBudgetLimited = diagnosticsWindowBudgetLimited || budgetLimited;

  const sampleWindowMs = Math.max(Number.EPSILON, sampledAtMs - diagnosticsWindowStartedAtMs);
  if (
    latestDiagnostics &&
    sampledAtMs - latestDiagnostics.sampledAtMs < SOLVER_DIAGNOSTICS_SAMPLE_INTERVAL_MS
  ) return;

  const averageFrameWallTimeMs = diagnosticsWindowFrames > 0
    ? diagnosticsWindowWallTimeMs / diagnosticsWindowFrames
    : 0;
  const selectedTimeStep_s = solver?.getTimeStep() || 0;
  const simulationTimeRate = sampleWindowMs > 0
    ? Math.max(0, (simTime - diagnosticsWindowStartedSimulationTime) / (sampleWindowMs / 1000))
    : 0;

  latestDiagnostics = {
    sampledAtMs,
    sampleWindowMs,
    frameWallTimeMs: Math.max(0, frameWallTimeMs),
    budgetMs,
    budgetUtilizationPercent: budgetMs > 0
      ? Math.min(1000, Math.max(0, (averageFrameWallTimeMs / budgetMs) * 100))
      : 0,
    stepsThisFrame,
    completedSteps,
    selectedTimeStep_s,
    simulationTime_s: simTime,
    simulationTimeRate,
    converged,
    budgetLimited: diagnosticsWindowBudgetLimited,
    fidelityMode,
  };

  diagnosticsWindowStartedAtMs = sampledAtMs;
  diagnosticsWindowStartedSimulationTime = simTime;
  diagnosticsWindowWallTimeMs = 0;
  diagnosticsWindowFrames = 0;
  diagnosticsWindowBudgetLimited = false;
}

function applyConfiguredTimeStep() {
  if (!solver) return;

  const nextTimeStep = fidelityMode === 'full-fidelity'
    ? requestedTimeStep
    : selectAdaptiveTimeStep(
      solverCostProfile(elements, solverNodeCount),
      requestedTimeStep,
    );
  solver.setTimeStep(nextTimeStep);
}

function updateWaveformSources() {
  for (const element of elements) {
    if (element.type !== 'VOLTAGE_SOURCE' || !element.waveform?.isAc) continue;
    element.value = sourceVoltageAtTime(element.waveform, simTime);
  }
}

function update555Behavior(result: ReturnType<MNASolver['solve']>): Record<string, boolean> {
  const states: Record<string, boolean> = {};

  for (const behavior of elements.filter((element) => element.type === 'BEHAVIORAL_555')) {
    const vcc = behavior.nodeA > 0 ? result.nodeVoltages[behavior.nodeA] || 0 : 0;
    const gnd = behavior.nodeB > 0 ? result.nodeVoltages[behavior.nodeB] || 0 : 0;
    const supply = vcc - gnd;
    const trig = behavior.controlNode && behavior.controlNode > 0
      ? (result.nodeVoltages[behavior.controlNode] || 0) - gnd
      : 0;
    const thresh = behavior.controlNode2 && behavior.controlNode2 > 0
      ? (result.nodeVoltages[behavior.controlNode2] || 0) - gnd
      : 0;
    const reset = behavior.resetNode && behavior.resetNode > 0
      ? (result.nodeVoltages[behavior.resetNode] || 0) - gnd
      : supply;

    let state = Boolean(behavior.behaviorState);
    if (supply < 3 || reset < supply * 0.2) {
      state = false;
    } else if (trig < supply / 3) {
      state = true;
    } else if (thresh > (2 * supply) / 3) {
      state = false;
    }

    behavior.behaviorState = state;
    states[behavior.id] = state;

    const output = elements.find((element) => element.id === behavior.outputElementId);
    const discharge = elements.find((element) => element.id === behavior.dischargeElementId);
    if (output) output.value = state ? Math.max(0, supply - 1.5) : 0;
    if (discharge) discharge.value = state ? 1e8 : 10;
  }

  return states;
}

function solveStep(forceScopeCapture = false): ReturnType<MNASolver['solve']> | null {
  if (!solver || !running) return null;

  // Event-driven substepping for RP2040 ARM Cortex-M0+ CPU execution:
  // Preserves sub-millisecond GPIO transitions (PWM, pulses down to sub-microsecond)
  // by breaking cycle execution at exact GPIO transition boundaries, solving MNA, and capturing scope samples.
  if (rp2040Controller && rp2040Controller.getState() === 'RUNNING') {
    const bridge = rp2040Controller.getGpioBridge();
    const dt = solver.getTimeStep();
    const freq = rp2040Controller.getClockFrequency_Hz();
    const totalTargetCycles = Math.round(dt * freq);

    let cyclesRemaining = totalTargetCycles;
    let latestSolveResult: ReturnType<MNASolver['solve']> | null = null;

    while (cyclesRemaining > 0) {
      const stepRes = rp2040Controller.stepCyclesWithEventBreak(cyclesRemaining);
      cyclesRemaining -= stepRes.cyclesExecuted;

      updateWaveformSources();
      solver.setElements(elements);
      const result = solver.solve();
      lastBehavioralStates = update555Behavior(result);
      latestResult = result;
      latestSolveResult = result;

      if (bridge) {
        const gpioToNodeMap = new Map<number, number>();
        for (let i = 0; i < 30; i++) {
          const resId = bridge.getMnaResistorId(i);
          const resElem = elements.find((e) => e.id === resId);
          if (resElem) {
            gpioToNodeMap.set(i, resElem.nodeB);
          }
        }
        bridge.updateFromMnaResult(result.nodeVoltages, gpioToNodeMap);
      }

      // When a GPIO transition occurs inside the step, capture a scope sample at the transition boundary!
      if (stepRes.eventOccurred) {
        captureScopeSample(result, true);
        bridge?.clearTransitionEvents();
      }
    }

    if (latestSolveResult) {
      solver.updateTransientState(latestSolveResult);
      simTime += solver.getTimeStep();
      captureScopeSample(latestSolveResult, forceScopeCapture);
      return latestSolveResult;
    }
  }

  updateWaveformSources();
  solver.setElements(elements);
  const result = solver.solve();
  lastBehavioralStates = update555Behavior(result);
  latestResult = result;

  // Update transient state (capacitors/inductors) before advancing physical
  // time. Every completed solve advances by the positive, currently selected
  // timestep, so the worker clock cannot move backwards or stall.
  solver.updateTransientState(result);
  simTime += solver.getTimeStep();

  // Feed MNA result into RP2040 GPIO bridge if loaded but paused/stopped
  if (rp2040Controller) {
    const bridge = rp2040Controller.getGpioBridge();
    if (bridge) {
      const gpioToNodeMap = new Map<number, number>();
      for (let i = 0; i < 30; i++) {
        const resId = bridge.getMnaResistorId(i);
        const resElem = elements.find((e) => e.id === resId);
        if (resElem) {
          gpioToNodeMap.set(i, resElem.nodeB);
        }
      }
      bridge.updateFromMnaResult(result.nodeVoltages, gpioToNodeMap);
    }
  }

  captureScopeSample(result, forceScopeCapture);

  return result;
}

function postResult(result: ReturnType<MNASolver['solve']>, stepsThisFrame: number) {
  if (!solver || !backpressureGate.claimResultPublication()) return;

  // Calculate power only for subscribed elements and only for the final solve
  // presented to the UI. Intermediate adaptive substeps still update the
  // transient state but do not pay the serialization cost.
  const elementById = new Map(elements.map((element) => [element.id, element]));
  const nodeIndices = resultSubscription?.nodeIndices
    || Array.from({ length: result.nodeVoltages.length }, (_, index) => index);
  const nodeVoltageValues = new Float64Array(nodeIndices.length);
  nodeIndices.forEach((nodeIndex, index) => {
    nodeVoltageValues[index] = result.nodeVoltages[nodeIndex] || 0;
  });

  const branchCurrentElementIds = resultSubscription?.branchCurrentElementIds
    || [...result.branchCurrents.keys()];
  const branchCurrentValues = new Float64Array(branchCurrentElementIds.length);
  branchCurrentElementIds.forEach((elementId, index) => {
    branchCurrentValues[index] = result.branchCurrents.get(elementId) || 0;
  });

  const powerElementIds = resultSubscription?.powerElementIds
    || elements.map((element) => element.id);
  const componentPowerValues = new Float64Array(powerElementIds.length);
  const componentApparentPowerValues = new Float64Array(powerElementIds.length);
  powerElementIds.forEach((elementId, index) => {
    const elem = elementById.get(elementId);
    if (!elem) return;
    const va = elem.nodeA > 0 && elem.nodeA < result.nodeVoltages.length
      ? result.nodeVoltages[elem.nodeA] : 0;
    const vb = elem.nodeB > 0 && elem.nodeB < result.nodeVoltages.length
      ? result.nodeVoltages[elem.nodeB] : 0;
    const voltage = va - vb;
    const current = result.branchCurrents.get(elem.id) || 0;
    // Passive sign convention: p = V * I.
    // For resistors/passives absorbing energy, p > 0.
    // For sources delivering energy, branchCurrent flows out of positive terminal, so p < 0.
    componentPowerValues[index] = voltage * current;
    componentApparentPowerValues[index] = Math.abs(voltage) * Math.abs(current);
  });

  let rp2040Snapshot: Rp2040ExecutionSnapshot | undefined = undefined;
  if (resultSubscription?.rp2040TelemetryEnabled && rp2040Controller) {
    const now = performance.now();
    if (now - lastTelemetryPostTime_ms >= TELEMETRY_INTERVAL_MS) {
      rp2040Snapshot = rp2040Controller.getExecutionSnapshot();
      lastTelemetryPostTime_ms = now;
    }
  }

  const resultMsg: WorkerResultMessage = {
    type: 'RESULT',
    nodeIndices,
    nodeVoltages: nodeVoltageValues,
    ...(branchCurrentElementIds.length > 0
      ? { branchCurrentElementIds, branchCurrents: branchCurrentValues }
      : {}),
    ...(powerElementIds.length > 0
      ? {
          powerElementIds,
          componentPower: componentPowerValues,
          componentApparentPower: componentApparentPowerValues,
        }
      : {}),
    converged: result.converged,
    timestamp: simTime,
    timeStep: solver.getTimeStep(),
    stepsThisFrame,
    fidelityMode,
    behavioralStates: lastBehavioralStates,
    ...(resultSubscription?.diagnosticsEnabled && latestDiagnostics
      ? { diagnostics: latestDiagnostics }
      : {}),
    ...(rp2040Controller
      ? {
          rp2040GpioStates: rp2040Controller.getGpioBridge()?.getAllDriverStates(),
          pwmDiagnostics: rp2040Controller.getPwmDiagnostics(),
        }
      : {}),
    ...(rp2040Snapshot ? { rp2040Snapshot } : {}),
  };

  const transferables = resultTransferables({
    nodeIndices,
    nodeVoltages: nodeVoltageValues,
    ...(branchCurrentElementIds.length > 0
      ? { branchCurrentElementIds, branchCurrents: branchCurrentValues }
      : {}),
    ...(powerElementIds.length > 0
      ? { powerElementIds, componentPower: componentPowerValues, componentApparentPower: componentApparentPowerValues }
      : {}),
  });
  self.postMessage(resultMsg, { transfer: transferables });

  // A single transferable batch contains all retained scope samples produced
  // since the previous presented result. The worker-side ring remains bounded
  // even when the main thread is temporarily unable to issue another credit.
  const scopeMsg = drainScopeBatch();
  if (scopeMsg) {
    self.postMessage(scopeMsg, {
      transfer: scopeBatchTransferables(scopeMsg),
    });
  }
}

function runSimulationFrame() {
  if (!solver || !running || paused) return;

  const frameSeconds = Math.min(
    SIMULATION_MODELS.clock.maxCatchUp_s,
    SIMULATION_MODELS.clock.framePeriod_s * speed,
  );
  const targetTime = simTime + frameSeconds;
  const frameStart = performance.now();
  const budgetMs = SIMULATION_MODELS.clock.solverBudget_ms;
  const maxSteps = SIMULATION_MODELS.clock.maxSubstepsPerFrame;
  let steps = 0;
  let lastResult: ReturnType<MNASolver['solve']> | null = null;

  // The first solve is always allowed because a single dense solve is
  // indivisible. Subsequent work is stopped at the wall-clock budget, which
  // prevents a large circuit from monopolizing the worker indefinitely.
  while (steps < maxSteps && simTime + Number.EPSILON < targetTime) {
    lastResult = solveStep();
    if (!lastResult) break;
    steps += 1;
    if (performance.now() - frameStart >= budgetMs) break;
  }

  const frameWallTimeMs = performance.now() - frameStart;
  const budgetLimited = Boolean(
    lastResult &&
    steps > 0 &&
    simTime + Number.EPSILON < targetTime &&
    (frameWallTimeMs >= budgetMs || steps >= maxSteps),
  );
  completedSteps += steps;
  recordDiagnostics(
    frameStart,
    frameWallTimeMs,
    steps,
    budgetMs,
    budgetLimited,
    lastResult?.converged ?? latestResult?.converged ?? true,
  );

  if (lastResult) postResult(lastResult, steps);
}

// ── Message Handler ─────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT': {
      const telemetryRequired = Boolean(msg.resultSubscription?.rp2040TelemetryEnabled);
      if (msg.telemetryGenerationId !== undefined) {
        if (!isValidTelemetryGenerationId(msg.telemetryGenerationId)) {
          throw new Error(`[SimulationWorker] Invalid telemetryGenerationId on INIT: ${msg.telemetryGenerationId}. Must be a positive integer.`);
        }
        currentTelemetryGenerationId = msg.telemetryGenerationId;
      } else if (telemetryRequired) {
        throw new Error('[SimulationWorker] Missing required telemetryGenerationId on INIT with telemetry enabled.');
      } else {
        currentTelemetryGenerationId = 1;
      }
      lastTelemetryPostTime_ms = 0;
      if (rp2040Controller) {
        rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
      }
      solver = new MNASolver(msg.numNodes, msg.dt);
      elements = msg.elements;
      solverNodeCount = msg.numNodes;
      requestedTimeStep = Number.isFinite(msg.dt)
        ? msg.dt
        : SIMULATION_MODELS.clock.defaultTimeStep_s;
      fidelityMode = msg.fidelityMode || 'adaptive';
      lastBehavioralStates = {};
      latestResult = null;
      backpressureGate.reset();
      completedSteps = 0;
      diagnosticsWindowStartedAtMs = Number.NaN;
      diagnosticsWindowStartedSimulationTime = 0;
      diagnosticsWindowWallTimeMs = 0;
      diagnosticsWindowFrames = 0;
      diagnosticsWindowBudgetLimited = false;
      latestDiagnostics = null;
      setResultSubscription(msg.resultSubscription);
      applyConfiguredTimeStep();
      simTime = 0;
      running = false;
      paused = false;
      speed = 1;

      setScopeChannels(msg.scopeChannels || {});
      setScopeSampleInterval(msg.scopeSampleInterval_s, msg.scopeCaptureRevision);

      solver.setElements(elements);
      break;
    }

    case 'UPDATE_PIN': {
      // Update a voltage source value (e.g., MCU pin toggled)
      const elem = elements.find((e) => e.id === msg.elementId);
      if (elem) {
        if (elem.type === 'MOTOR_DC') {
          elem.backEmf = msg.voltage;
        } else {
          elem.value = msg.voltage;
        }
      }
      break;
    }

    case 'UPDATE_SOURCE': {
      const elem = elements.find((e) => e.id === msg.elementId);
      if (elem) {
        elem.value = msg.voltage;
        elem.waveform = msg.waveform;
      }
      break;
    }

    case 'UPDATE_ELEMENTS': {
      // Preserve transient capacitor/inductor state while replacing values
      // after a live property edit. The topology watcher handles structural
      // changes with a full worker restart; this path is for model values.
      elements = replaceMnaElementsPreservingTransientState(elements, msg.elements);
      if (!solver || msg.numNodes !== elements.reduce((max, element) => Math.max(max, element.nodeA, element.nodeB), 0)) {
        solver = new MNASolver(msg.numNodes, solver?.getTimeStep() || 0.001);
      }
      solverNodeCount = msg.numNodes;
      solver.setElements(elements);
      applyConfiguredTimeStep();
      latestResult = null;
      if (msg.resultSubscription) setResultSubscription(msg.resultSubscription);
      setScopeChannels(msg.scopeChannels || {});
      break;
    }

    case 'UPDATE_ELEMENT_VALUES': {
      // Keep the compiled element array and voltage-source index intact. The
      // solver mutates only model parameters and preserves transient history.
      solver?.updateElementValues(msg.updates);
      latestResult = null;
      break;
    }

    case 'SET_SCOPE_CHANNELS': {
      setScopeChannels(msg.scopeChannels);
      break;
    }

    case 'SET_SCOPE_CONFIG': {
      setScopeSampleInterval(msg.sampleInterval_s, msg.revision);
      break;
    }

    case 'REQUEST_RESULT': {
      // Repeated requests collapse into one credit. This is what keeps a slow
      // main thread from creating a worker-side result queue.
      backpressureGate.requestResult();
      // Pausing must expose the last reached state without advancing time.
      if (paused && backpressureGate.hasPendingCredit && latestResult) postResult(latestResult, 0);
      break;
    }

    case 'SET_RESULT_SUBSCRIPTION': {
      setResultSubscription(msg.subscription);
      if (paused && backpressureGate.hasPendingCredit && latestResult) postResult(latestResult, 0);
      break;
    }

    case 'START': {
      if (msg.telemetryGenerationId !== undefined) {
        if (!isValidTelemetryGenerationId(msg.telemetryGenerationId)) {
          throw new Error(`[SimulationWorker] Invalid telemetryGenerationId on START: ${msg.telemetryGenerationId}. Must be a positive integer.`);
        }
        currentTelemetryGenerationId = msg.telemetryGenerationId;
        if (rp2040Controller) {
          rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
        }
      }
      if (!backpressureGate.start()) break;
      running = true;
      paused = false;
      rp2040Controller?.start();
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(runSimulationFrame, SIMULATION_MODELS.clock.framePeriod_s * 1000);
      break;
    }

    case 'PAUSE': {
      backpressureGate.pause();
      paused = true;
      rp2040Controller?.pause();
      if (backpressureGate.hasPendingCredit && latestResult) postResult(latestResult, 0);
      break;
    }

    case 'RESUME': {
      if (running && backpressureGate.resume()) {
        paused = false;
        rp2040Controller?.resume();
      }
      break;
    }

    case 'STEP': {
      // A manual step owns its presentation credit. A separate REQUEST_RESULT
      // while paused could otherwise publish the cached pre-step state first
      // and consume the only credit before this solve completes.
      if (!backpressureGate.requestStep()) break;
      const result = solveStep(true);
      if (result) postResult(result, 1);
      break;
    }

    case 'SET_SPEED': {
      speed = Math.max(0.05, Math.min(20, Number.isFinite(msg.speed) ? msg.speed : 1));
      break;
    }

    case 'STOP': {
      running = false;
      paused = false;
      speed = 1;
      if (rp2040Controller) {
        rp2040Controller.stop();
        rp2040Controller = null;
      }
      backpressureGate.stop();
      latestResult = null;
      resultSubscription = null;
      completedSteps = 0;
      latestDiagnostics = null;
      lastTelemetryPostTime_ms = 0;
      setScopeChannels({});
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
    }

    case 'SET_TIMESTEP': {
      requestedTimeStep = Number.isFinite(msg.dt)
        ? msg.dt
        : SIMULATION_MODELS.clock.defaultTimeStep_s;
      applyConfiguredTimeStep();
      break;
    }

    case 'LOAD_RP2040_FIRMWARE': {
      const telemetryRequired = Boolean(resultSubscription?.rp2040TelemetryEnabled);
      if (msg.telemetryGenerationId !== undefined) {
        if (!isValidTelemetryGenerationId(msg.telemetryGenerationId)) {
          const reply: WorkerRp2040LoadResultMessage = {
            type: 'RP2040_LOAD_RESULT',
            success: false,
            vectorTable: null,
            errors: [`Invalid telemetryGenerationId: ${msg.telemetryGenerationId}. Must be a positive integer.`],
            warnings: [],
          };
          self.postMessage(reply);
          break;
        }
        currentTelemetryGenerationId = msg.telemetryGenerationId;
      } else if (telemetryRequired) {
        const reply: WorkerRp2040LoadResultMessage = {
          type: 'RP2040_LOAD_RESULT',
          success: false,
          vectorTable: null,
          errors: ['Missing required telemetryGenerationId on LOAD_RP2040_FIRMWARE when telemetry is subscribed.'],
          warnings: [],
        };
        self.postMessage(reply);
        break;
      }
      rp2040Controller = new RP2040Controller(
        msg.boardConfig,
        msg.clockFrequency_Hz,
        msg.boardComponentId,
        msg.vddIo
      );
      // Adopt authoritative generation on new controller BEFORE loading firmware:
      rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
      rp2040Controller.onDriverChange((event) => {
        const elemSrc = elements.find((e) => e.id === event.sourceId);
        if (elemSrc) elemSrc.value = event.targetVoltage_V;
        const elemRes = elements.find((e) => e.id === event.resistorId);
        if (elemRes) elemRes.value = event.resistance_Ohms;
      });
      rp2040Controller.onSerialTransmit((byte, simTime, uartIdx) => {
        const uart = rp2040Controller?.getUart(uartIdx as 0 | 1);
        const text = String.fromCharCode(byte);
        const outMsg: WorkerSerialOutputMessage = {
          type: 'SERIAL_OUTPUT',
          text,
          simulatedTime_s: simTime,
          uartIndex: uartIdx,
          baudRate: uart?.baudRate || 115200,
        };
        self.postMessage(outMsg);
      });
      const res = rp2040Controller.loadFirmware(msg.firmwareBuffer);
      // Ensure controller retains currentTelemetryGenerationId and sequence is reset to 0:
      rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
      const reply: WorkerRp2040LoadResultMessage = {
        type: 'RP2040_LOAD_RESULT',
        success: res.success,
        vectorTable: res.vectorTable,
        errors: res.errors,
        warnings: res.warnings,
      };
      self.postMessage(reply);
      break;
    }

    case 'RP2040_STEP': {
      if (rp2040Controller) {
        const stepRes = msg.cycles !== undefined
          ? rp2040Controller.stepCycles(msg.cycles)
          : rp2040Controller.step(msg.instructions || 1);
        const reply: WorkerRp2040StepResultMessage = {
          type: 'RP2040_STEP_RESULT',
          ...stepRes,
        };
        self.postMessage(reply);
      }
      break;
    }

    case 'RP2040_RESET': {
      const telemetryRequired = Boolean(resultSubscription?.rp2040TelemetryEnabled);
      if (msg.telemetryGenerationId !== undefined) {
        if (!isValidTelemetryGenerationId(msg.telemetryGenerationId)) {
          self.postMessage({
            type: 'RP2040_RESET_ERROR',
            error: `Invalid telemetryGenerationId: ${msg.telemetryGenerationId}. Must be a positive integer.`,
          });
          break;
        }
        currentTelemetryGenerationId = msg.telemetryGenerationId;
      } else if (telemetryRequired) {
        self.postMessage({
          type: 'RP2040_RESET_ERROR',
          error: 'Missing required telemetryGenerationId on RP2040_RESET when telemetry is subscribed.',
        });
        break;
      }
      if (rp2040Controller) {
        // Adopt generation before reset
        rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
        rp2040Controller.reset();
        // Ensure generation is adopted and sequence counter is reset to 0
        rp2040Controller.setTelemetryGeneration(currentTelemetryGenerationId);
        self.postMessage({
          type: 'RP2040_RESET_COMPLETE',
          telemetryGenerationId: currentTelemetryGenerationId,
        });
      }
      break;
    }

    case 'RP2040_GET_SNAPSHOT': {
      if (rp2040Controller) {
        const reply: WorkerRp2040SnapshotMessage = {
          type: 'RP2040_SNAPSHOT',
          snapshot: rp2040Controller.getExecutionSnapshot(),
        };
        self.postMessage(reply);
      }
      break;
    }

    case 'SERIAL_INPUT': {
      if (rp2040Controller) {
        rp2040Controller.sendSerialString(msg.text, (msg.uartIndex ?? 0) as 0 | 1);
      }
      break;
    }
  }
};
