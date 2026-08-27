import type { CanvasNode } from '../../../types/domain';
import type { SimulationFidelityMode } from '../simulationModels';
import type { SolverDiagnosticsSnapshot } from '../solverDiagnostics';
import type {
  MaximumComponentRegressionPreset,
  RegressionRepresentativeKind,
} from '../../../store/maxComponentRegressionPreset';

export interface RegressionTraceSample extends SolverDiagnosticsSnapshot {
  observedNodeCount: number;
}

export interface RegressionRepresentativeCheck {
  kind: RegressionRepresentativeKind;
  expectedNodeCount: number;
  observedNodeCount: number;
  sampled: boolean;
  nodeIds: string[];
}

export interface MaximumComponentRegressionTrace {
  fixtureId: string;
  fidelityMode: SimulationFidelityMode;
  durationMs: number;
  sampleCount: number;
  samples: RegressionTraceSample[];
  convergedSamples: number;
  nonConvergedSamples: number;
  monotonicSimulationTime: boolean;
  completedSteps: number;
  averageSimulationTimeRate: number;
  representativeChecks: RegressionRepresentativeCheck[];
}

export interface RegressionRuntime {
  setFidelityMode: (mode: SimulationFidelityMode) => void;
  start: () => Promise<void> | void;
  stop: () => void;
  subscribe: (listener: () => void) => () => void;
  getDiagnostics: () => SolverDiagnosticsSnapshot | null;
  getNodes: () => CanvasNode[];
}

export interface RegressionRunOptions {
  durationMs?: number;
  sampleIntervalMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  shouldStop?: () => boolean;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, ms);
});

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function representativeChecks(
  preset: MaximumComponentRegressionPreset,
  nodes: CanvasNode[],
  sampleCount: number,
): RegressionRepresentativeCheck[] {
  const present = new Set(nodes.map((node) => node.id));
  return (Object.entries(preset.representativeNodes) as Array<[RegressionRepresentativeKind, string[]]>).map(([kind, ids]) => {
    const observedIds = ids.filter((id) => present.has(id));
    return {
      kind,
      expectedNodeCount: ids.length,
      observedNodeCount: observedIds.length,
      sampled: sampleCount > 0,
      nodeIds: observedIds,
    };
  });
}

/**
 * Runs one deterministic fidelity trace against an injected runtime. The
 * runtime adapter owns canvas loading and engine lifecycle; this evaluator is
 * therefore usable by the editor and by a future deterministic browser test
 * harness without duplicating simulation behavior.
 */
export async function runMaximumComponentRegression(
  preset: MaximumComponentRegressionPreset,
  mode: SimulationFidelityMode,
  runtime: RegressionRuntime,
  options: RegressionRunOptions = {},
): Promise<MaximumComponentRegressionTrace> {
  const durationMs = Math.max(1, Math.trunc(options.durationMs ?? preset.durationMs));
  const sampleIntervalMs = Math.max(16, Math.trunc(options.sampleIntervalMs ?? 250));
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? defaultWait;
  const shouldStop = options.shouldStop ?? (() => false);
  const samples: RegressionTraceSample[] = [];
  let lastSampleTimestamp = Number.NaN;

  runtime.setFidelityMode(mode);
  const unsubscribe = runtime.subscribe(() => {
    const diagnostics = runtime.getDiagnostics();
    if (!diagnostics || diagnostics.sampledAtMs === lastSampleTimestamp) return;
    lastSampleTimestamp = diagnostics.sampledAtMs;
    samples.push({
      ...diagnostics,
      observedNodeCount: runtime.getNodes().length,
    });
  });

  try {
    await runtime.start();
    const startedAt = now();
    while (!shouldStop() && now() - startedAt < durationMs) {
      const diagnostics = runtime.getDiagnostics();
      if (diagnostics && diagnostics.sampledAtMs !== lastSampleTimestamp) {
        lastSampleTimestamp = diagnostics.sampledAtMs;
        samples.push({ ...diagnostics, observedNodeCount: runtime.getNodes().length });
      }
      await wait(Math.min(sampleIntervalMs, Math.max(1, durationMs - (now() - startedAt))));
    }
  } finally {
    unsubscribe();
    runtime.stop();
  }

  const timestamps = samples.map((sample) => sample.simulationTime_s);
  const monotonicSimulationTime = timestamps.every((timestamp, index) => (
    index === 0 || timestamp + Number.EPSILON >= timestamps[index - 1]
  ));
  const convergedSamples = samples.filter((sample) => sample.converged).length;
  const rates = samples.map((sample) => sample.simulationTimeRate).filter((rate) => rate > 0);

  return {
    fixtureId: preset.id,
    fidelityMode: mode,
    durationMs,
    sampleCount: samples.length,
    samples,
    convergedSamples,
    nonConvergedSamples: samples.length - convergedSamples,
    monotonicSimulationTime,
    completedSteps: samples.length > 0 ? samples[samples.length - 1].completedSteps : 0,
    averageSimulationTimeRate: rates.length > 0
      ? rates.reduce((total, rate) => total + finite(rate), 0) / rates.length
      : 0,
    representativeChecks: representativeChecks(preset, runtime.getNodes(), samples.length),
  };
}

export interface RegressionComparison {
  fixtureId: string;
  sameDuration: boolean;
  adaptive: MaximumComponentRegressionTrace;
  fullFidelity: MaximumComponentRegressionTrace;
  bothMonotonic: boolean;
  bothSampled: boolean;
}

export function compareMaximumComponentRegression(
  adaptive: MaximumComponentRegressionTrace,
  fullFidelity: MaximumComponentRegressionTrace,
): RegressionComparison {
  return {
    fixtureId: adaptive.fixtureId,
    sameDuration: adaptive.durationMs === fullFidelity.durationMs,
    adaptive,
    fullFidelity,
    bothMonotonic: adaptive.monotonicSimulationTime && fullFidelity.monotonicSimulationTime,
    bothSampled: adaptive.sampleCount > 0 && fullFidelity.sampleCount > 0,
  };
}
