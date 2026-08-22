// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation WebWorker
// Runs the MNA solver off the main thread. Receives circuit definitions and
// MCU pin states, solves the circuit, and posts results back at ~60fps.
// ═══════════════════════════════════════════════════════════════════════════

import { MNASolver } from './MNASolver';
import type { MNAElement } from './MNASolver';
import { SIMULATION_MODELS, sourceVoltageAtTime } from './simulationModels';

// ── Message types ───────────────────────────────────────────────────────

export interface WorkerInitMessage {
  type: 'INIT';
  numNodes: number;
  elements: MNAElement[];
  dt: number;
  scopeChannels?: Record<string, number>;
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

export interface WorkerStartMessage {
  type: 'START';
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

export type WorkerInMessage =
  | WorkerInitMessage
  | WorkerUpdatePinMessage
  | WorkerUpdateSourceMessage
  | WorkerStartMessage
  | WorkerStopMessage
  | WorkerPauseMessage
  | WorkerResumeMessage
  | WorkerStepMessage
  | WorkerSetSpeedMessage
  | WorkerSetTimeStepMessage;

export interface WorkerResultMessage {
  type: 'RESULT';
  nodeVoltages: number[];
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  converged: boolean;
  timestamp: number;
  behavioralStates?: Record<string, boolean>;
}

export interface WorkerOscilloscopeMessage {
  type: 'OSCILLOSCOPE';
  samples: Record<string, number>;  // nodeIndex → voltage
  timestamp: number;
  frames?: Array<{ timestamp: number; samples: Record<string, number> }>;
}

export type WorkerOutMessage = WorkerResultMessage | WorkerOscilloscopeMessage;

// ── Worker Logic ────────────────────────────────────────────────────────

let solver: MNASolver | null = null;
let elements: MNAElement[] = [];
let running = false;
let paused = false;
let speed = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let simTime = 0;

// Scope channels are named by the canvas instrument, not by anonymous MNA
// node indexes. This keeps CH1/CH2 stable when the netlist is rebuilt.
let scopeChannels: Record<string, number> = {};
let pendingScopeFrames: Array<{ timestamp: number; samples: Record<string, number> }> = [];

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

function doSolve(shouldPost = true) {
  if (!solver || !running) return;

  updateWaveformSources();
  solver.setElements(elements);
  const result = solver.solve();
  const behavioralStates = update555Behavior(result);

  if (!result.converged) {
    // Still send partial results so UI isn't stale
  }

  // Update transient state (capacitors)
  solver.updateTransientState(result);

  // Increment simulation time
  simTime += solver.getTimeStep();

  if (Object.keys(scopeChannels).length > 0) {
    const scopeSamples: Record<string, number> = {};
    for (const [channel, nodeIdx] of Object.entries(scopeChannels)) {
      if (nodeIdx > 0 && nodeIdx < result.nodeVoltages.length) {
        scopeSamples[channel] = result.nodeVoltages[nodeIdx];
      }
    }
    if (Object.keys(scopeSamples).length > 0) {
      pendingScopeFrames.push({ timestamp: simTime, samples: scopeSamples });
    }
  }

  if (!shouldPost) return;

  // Calculate power dissipation per element
  const componentPower: Record<string, number> = {};
  for (const elem of elements) {
    const va = elem.nodeA > 0 && elem.nodeA < result.nodeVoltages.length
      ? result.nodeVoltages[elem.nodeA] : 0;
    const vb = elem.nodeB > 0 && elem.nodeB < result.nodeVoltages.length
      ? result.nodeVoltages[elem.nodeB] : 0;
    const voltage = Math.abs(va - vb);
    const current = Math.abs(result.branchCurrents.get(elem.id) || 0);
    componentPower[elem.id] = voltage * current;
  }

  // Convert Map to plain object for postMessage
  const branchCurrentsObj: Record<string, number> = {};
  for (const [key, val] of result.branchCurrents) {
    branchCurrentsObj[key] = val;
  }

  const resultMsg: WorkerResultMessage = {
    type: 'RESULT',
    nodeVoltages: result.nodeVoltages,
    branchCurrents: branchCurrentsObj,
    componentPower,
    converged: result.converged,
    timestamp: simTime,
    behavioralStates,
  };

  self.postMessage(resultMsg);

  // Send oscilloscope samples if there are scope probes
  if (pendingScopeFrames.length > 0) {
    const samples = pendingScopeFrames[pendingScopeFrames.length - 1].samples;
    const scopeMsg: WorkerOscilloscopeMessage = {
      type: 'OSCILLOSCOPE',
      samples,
      timestamp: simTime,
      frames: pendingScopeFrames,
    };
    self.postMessage(scopeMsg);
    pendingScopeFrames = [];
  }
}

// ── Message Handler ─────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT': {
      solver = new MNASolver(msg.numNodes, msg.dt);
      elements = msg.elements;
      simTime = 0;
      pendingScopeFrames = [];
      paused = false;
      speed = 1;

      scopeChannels = msg.scopeChannels || {};

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

    case 'START': {
      running = true;
      paused = false;
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!running || paused || !solver) return;
        const frameSeconds = Math.min(
          SIMULATION_MODELS.clock.maxCatchUp_s,
          SIMULATION_MODELS.clock.framePeriod_s * speed,
        );
        const stepCount = Math.max(1, Math.min(
          SIMULATION_MODELS.clock.maxSubstepsPerFrame,
          Math.round(frameSeconds / solver.getTimeStep()),
        ));
        for (let i = 0; i < stepCount - 1; i++) {
          doSolve(false);
        }
        doSolve(true);
      }, 16);
      break;
    }

    case 'PAUSE': {
      paused = true;
      break;
    }

    case 'RESUME': {
      if (running) paused = false;
      break;
    }

    case 'STEP': {
      if (solver && running) doSolve(true);
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
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
    }

    case 'SET_TIMESTEP': {
      if (solver) solver.setTimeStep(msg.dt);
      break;
    }
  }
};
