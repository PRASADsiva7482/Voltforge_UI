// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — Simulation WebWorker
// Runs the MNA solver off the main thread. Receives circuit definitions and
// MCU pin states, solves the circuit, and posts results back at ~60fps.
// ═══════════════════════════════════════════════════════════════════════════

import { MNASolver } from './MNASolver';
import type { MNAElement } from './MNASolver';

// ── Message types ───────────────────────────────────────────────────────

export interface WorkerInitMessage {
  type: 'INIT';
  numNodes: number;
  elements: MNAElement[];
  dt: number;
}

export interface WorkerUpdatePinMessage {
  type: 'UPDATE_PIN';
  elementId: string;
  voltage: number;
}

export interface WorkerStartMessage {
  type: 'START';
}

export interface WorkerStopMessage {
  type: 'STOP';
}

export interface WorkerSetTimeStepMessage {
  type: 'SET_TIMESTEP';
  dt: number;
}

export type WorkerInMessage =
  | WorkerInitMessage
  | WorkerUpdatePinMessage
  | WorkerStartMessage
  | WorkerStopMessage
  | WorkerSetTimeStepMessage;

export interface WorkerResultMessage {
  type: 'RESULT';
  nodeVoltages: number[];
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
  converged: boolean;
  timestamp: number;
}

export interface WorkerOscilloscopeMessage {
  type: 'OSCILLOSCOPE';
  samples: Record<string, number>;  // nodeIndex → voltage
  timestamp: number;
}

export type WorkerOutMessage = WorkerResultMessage | WorkerOscilloscopeMessage;

// ── Worker Logic ────────────────────────────────────────────────────────

let solver: MNASolver | null = null;
let elements: MNAElement[] = [];
let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let simTime = 0;

// Track oscilloscope probe nodes
let scopeNodes: number[] = [];

function doSolve() {
  if (!solver || !running) return;

  solver.setElements(elements);
  const result = solver.solve();

  if (!result.converged) {
    // Still send partial results so UI isn't stale
  }

  // Update transient state (capacitors)
  solver.updateTransientState(result);

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
  };

  self.postMessage(resultMsg);

  // Send oscilloscope samples if there are scope probes
  if (scopeNodes.length > 0) {
    const samples: Record<string, number> = {};
    for (const nodeIdx of scopeNodes) {
      if (nodeIdx > 0 && nodeIdx < result.nodeVoltages.length) {
        samples[String(nodeIdx)] = result.nodeVoltages[nodeIdx];
      }
    }
    const scopeMsg: WorkerOscilloscopeMessage = {
      type: 'OSCILLOSCOPE',
      samples,
      timestamp: simTime,
    };
    self.postMessage(scopeMsg);
  }

  simTime += solver['dt'] || 0.001;
}

// ── Message Handler ─────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT': {
      solver = new MNASolver(msg.numNodes, msg.dt);
      elements = msg.elements;
      simTime = 0;

      // Identify oscilloscope probe nodes (elements starting with "scope_")
      scopeNodes = elements
        .filter((e) => e.id.startsWith('scope_'))
        .map((e) => e.nodeA)
        .filter((n) => n > 0);

      solver.setElements(elements);
      break;
    }

    case 'UPDATE_PIN': {
      // Update a voltage source value (e.g., MCU pin toggled)
      const elem = elements.find((e) => e.id === msg.elementId);
      if (elem) {
        elem.value = msg.voltage;
      }
      break;
    }

    case 'START': {
      running = true;
      // Run solver at ~60fps (16ms intervals)
      // Each interval may run multiple micro-steps for accuracy
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!running) return;
        // Run 10 solver steps per frame for transient accuracy
        for (let i = 0; i < 10; i++) {
          doSolve();
        }
      }, 16);
      break;
    }

    case 'STOP': {
      running = false;
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
