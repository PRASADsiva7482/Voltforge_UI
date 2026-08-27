import type { SimulationFidelityMode } from './simulationModels';

/**
 * A low-frequency worker sample used by the diagnostics surface and the
 * maximum-component regression runner. This is deliberately separate from
 * the normal solver result contract so instrumentation cannot leak into the
 * hot path unless diagnostics are explicitly subscribed.
 */
export interface SolverDiagnosticsSnapshot {
  /** Wall-clock timestamp from the worker's performance clock. */
  sampledAtMs: number;
  /** Wall time represented by this sample window. */
  sampleWindowMs: number;
  /** Wall time spent solving during the most recent worker frame. */
  frameWallTimeMs: number;
  /** Configured wall-clock budget for one worker frame. */
  budgetMs: number;
  /** Average frame budget consumption over the sample window. */
  budgetUtilizationPercent: number;
  /** Completed solver passes in the most recent worker frame. */
  stepsThisFrame: number;
  /** Cumulative completed solver passes since this worker was initialized. */
  completedSteps: number;
  /** Timestep selected by the active fidelity policy, in seconds. */
  selectedTimeStep_s: number;
  /** Monotonic physical simulation time, in seconds. */
  simulationTime_s: number;
  /** Physical simulation seconds advanced per wall-clock second. */
  simulationTimeRate: number;
  /** Whether the most recently published solve converged. */
  converged: boolean;
  /** Whether the worker stopped this sample window at its work budget. */
  budgetLimited: boolean;
  fidelityMode: SimulationFidelityMode;
}

export const SOLVER_DIAGNOSTICS_SAMPLE_INTERVAL_MS = 250;

