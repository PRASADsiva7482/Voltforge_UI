import type { MaximumComponentRegressionPreset } from '../../../store/maxComponentRegressionPreset';
import {
  startCanvasRenderInstrumentation,
  type CanvasLayoutRenderEvent,
  type CanvasRenderEvent,
  type CurrentFlowDrawEvent,
} from '../canvasRenderInstrumentation';
import type { CurrentFlowQualityMode, ViewportTransform } from '../renderBudget';

export type CanvasRenderScenarioId = 'disabled' | 'adaptive' | 'limited' | 'full';

export interface CanvasRenderScenarioDefinition {
  id: CanvasRenderScenarioId;
  label: string;
  showCurrentFlow: boolean;
  qualityMode: CurrentFlowQualityMode;
  viewportMotion: ViewportTransform[];
}

export interface CanvasFrameTimeSummary {
  sampleCount: number;
  averageMs: number;
  p95Ms: number;
  maximumMs: number;
  framesOver50Ms: number;
}

export interface CanvasGpuActivityObservation {
  renderer: 'Konva Canvas2D';
  measurement: 'canvas-submission-proxy';
  canvasDrawCount: number;
  submittedParticleCount: number;
  canvasDrawCpuTimeMs: number;
  webGpuAvailable: boolean;
  directGpuTimingAvailable: false;
}

export interface CanvasRenderScenarioTrace {
  id: CanvasRenderScenarioId;
  label: string;
  qualityMode: CurrentFlowQualityMode;
  currentFlowEnabled: boolean;
  viewportMotionSignature: string;
  resultStreamSignature: string;
  mountedWireShapes: { minimum: number; maximum: number; totalWires: number };
  compiledFlowPathCount: number;
  maximumParticlesPerDraw: number;
  maximumParticlesOnSinglePath: number;
  configuredParticleCap: number | null;
  configuredPerWireParticleCap: number | null;
  particleCapsObserved: boolean;
  configuredFrameIntervalMs: number;
  observedAnimationIntervalMs: number;
  budgetLimitedObserved: boolean;
  currentValuesStableOnQualitySwitch: boolean;
  measurementConsumersStable: boolean;
  frameTime: CanvasFrameTimeSummary;
  gpuActivity: CanvasGpuActivityObservation;
}

export interface MaximumCanvasRenderTrace {
  fixtureId: string;
  recordedAt: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  userAgent: string;
  completed: boolean;
  sameOverviewMotion: boolean;
  sameResultStream: boolean;
  scenarios: CanvasRenderScenarioTrace[];
}

export interface CanvasRenderRegressionRuntime {
  viewportWidth: number;
  viewportHeight: number;
  setScenario: (showCurrentFlow: boolean, qualityMode: CurrentFlowQualityMode) => void;
  setViewport: (viewport: ViewportTransform) => void;
  publishWireCurrents: (wireCurrents: Record<string, number>) => void;
  getWireCurrents: () => Readonly<Record<string, number>>;
  getMeasurementConsumerSignature: () => string;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
}

export interface CanvasRenderRegressionOptions {
  framesPerViewport?: number;
  shouldStop?: () => boolean;
}

const STANDARD_VIEWPORT_MOTION: ViewportTransform[] = [
  { x: -80, y: -40, scale: 1 },
  { x: -320, y: -120, scale: 0.85 },
  { x: -140, y: -260, scale: 0.72 },
];

const OVERVIEW_VIEWPORT_MOTION: ViewportTransform[] = [
  { x: -80, y: -40, scale: 0.55 },
  { x: -320, y: -120, scale: 0.45 },
  { x: -140, y: -260, scale: 0.6 },
];

export function maximumCanvasRenderScenarios(): CanvasRenderScenarioDefinition[] {
  return [
    {
      id: 'disabled',
      label: 'Current flow disabled',
      showCurrentFlow: false,
      qualityMode: 'adaptive',
      viewportMotion: STANDARD_VIEWPORT_MOTION.map((viewport) => ({ ...viewport })),
    },
    {
      id: 'adaptive',
      label: 'Adaptive detail',
      showCurrentFlow: true,
      qualityMode: 'adaptive',
      viewportMotion: STANDARD_VIEWPORT_MOTION.map((viewport) => ({ ...viewport })),
    },
    {
      id: 'limited',
      label: 'Adaptive overview limit',
      showCurrentFlow: true,
      qualityMode: 'adaptive',
      viewportMotion: OVERVIEW_VIEWPORT_MOTION.map((viewport) => ({ ...viewport })),
    },
    {
      id: 'full',
      label: 'Full detail override',
      showCurrentFlow: true,
      qualityMode: 'full',
      viewportMotion: OVERVIEW_VIEWPORT_MOTION.map((viewport) => ({ ...viewport })),
    },
  ];
}

export function createCanvasRegressionWireCurrents(
  wireIds: readonly string[],
  frameIndex: number,
): Record<string, number> {
  return Object.fromEntries(wireIds.map((wireId, wireIndex) => {
    const direction = (wireIndex + frameIndex) % 2 === 0 ? 1 : -1;
    const magnitude = ((wireIndex % 11) + 1) * 0.0007 * (1 + frameIndex * 0.05);
    return [wireId, direction * magnitude];
  }));
}

function numericRecordSignature(values: Readonly<Record<string, number>>): string {
  return Object.keys(values)
    .sort()
    .map((key) => `${key}:${Number(values[key]).toPrecision(12)}`)
    .join('|');
}

function viewportMotionSignature(viewports: readonly ViewportTransform[]): string {
  return viewports.map((viewport) => `${viewport.x},${viewport.y},${viewport.scale}`).join('|');
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function summarizeFrameTimes(frameTimes: number[]): CanvasFrameTimeSummary {
  return {
    sampleCount: frameTimes.length,
    averageMs: frameTimes.length > 0
      ? frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length
      : 0,
    p95Ms: percentile(frameTimes, 0.95),
    maximumMs: frameTimes.length > 0 ? Math.max(...frameTimes) : 0,
    framesOver50Ms: frameTimes.filter((value) => value > 50).length,
  };
}

function averageEventInterval(events: CurrentFlowDrawEvent[]): number {
  if (events.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < events.length; index += 1) {
    total += Math.max(0, events[index].timestampMs - events[index - 1].timestampMs);
  }
  return total / (events.length - 1);
}

function waitForAnimationFrames(
  runtime: CanvasRenderRegressionRuntime,
  frameCount: number,
  shouldStop: () => boolean,
): Promise<number[]> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    let previousTimestamp = runtime.now();
    let observedFrames = 0;
    const onFrame: FrameRequestCallback = (timestamp) => {
      if (shouldStop()) {
        resolve(frameTimes);
        return;
      }
      frameTimes.push(Math.max(0, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      observedFrames += 1;
      if (observedFrames >= frameCount) resolve(frameTimes);
      else runtime.requestFrame(onFrame);
    };
    runtime.requestFrame(onFrame);
  });
}

function summarizeScenario(
  scenario: CanvasRenderScenarioDefinition,
  events: CanvasRenderEvent[],
  frameTimes: number[],
  resultStreamSignature: string,
  currentValuesStableOnQualitySwitch: boolean,
  measurementConsumersStable: boolean,
  totalWireCount: number,
): CanvasRenderScenarioTrace {
  const layouts = events.filter((event): event is CanvasLayoutRenderEvent => event.kind === 'canvas-layout');
  const draws = events.filter((event): event is CurrentFlowDrawEvent => event.kind === 'flow-draw');
  const compilations = events.filter((event) => event.kind === 'flow-compile');
  const mountedCounts = layouts.map((event) => event.mountedWireShapeCount);
  const latestLayout = layouts.at(-1);
  const submittedParticleCount = draws.reduce((total, event) => total + event.particleDrawCount, 0);

  return {
    id: scenario.id,
    label: scenario.label,
    qualityMode: scenario.qualityMode,
    currentFlowEnabled: scenario.showCurrentFlow,
    viewportMotionSignature: viewportMotionSignature(scenario.viewportMotion),
    resultStreamSignature,
    mountedWireShapes: {
      minimum: mountedCounts.length > 0 ? Math.min(...mountedCounts) : 0,
      maximum: mountedCounts.length > 0 ? Math.max(...mountedCounts) : 0,
      totalWires: latestLayout?.totalWireCount ?? totalWireCount,
    },
    compiledFlowPathCount: compilations.length > 0
      ? Math.max(...compilations.map((event) => event.compiledFlowPathCount))
      : 0,
    maximumParticlesPerDraw: draws.length > 0
      ? Math.max(...draws.map((event) => event.particleDrawCount))
      : 0,
    maximumParticlesOnSinglePath: draws.length > 0
      ? Math.max(...draws.map((event) => event.maximumParticlesOnSinglePath))
      : 0,
    configuredParticleCap: latestLayout?.configuredParticleCap ?? null,
    configuredPerWireParticleCap: latestLayout?.configuredPerWireParticleCap ?? null,
    particleCapsObserved: draws.every((event) => (
      (latestLayout?.configuredParticleCap === null || latestLayout?.configuredParticleCap === undefined
        || event.particleDrawCount <= latestLayout.configuredParticleCap)
      && (latestLayout?.configuredPerWireParticleCap === null || latestLayout?.configuredPerWireParticleCap === undefined
        || event.maximumParticlesOnSinglePath <= latestLayout.configuredPerWireParticleCap)
    )),
    configuredFrameIntervalMs: latestLayout?.configuredFrameIntervalMs ?? 0,
    observedAnimationIntervalMs: averageEventInterval(draws),
    budgetLimitedObserved: layouts.some((event) => event.budgetLimited),
    currentValuesStableOnQualitySwitch,
    measurementConsumersStable,
    frameTime: summarizeFrameTimes(frameTimes),
    gpuActivity: {
      renderer: 'Konva Canvas2D',
      measurement: 'canvas-submission-proxy',
      canvasDrawCount: draws.length,
      submittedParticleCount,
      canvasDrawCpuTimeMs: draws.reduce((total, event) => total + event.drawCpuTimeMs, 0),
      webGpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
      directGpuTimingAvailable: false,
    },
  };
}

/**
 * Runs the real mounted Konva canvas through a repeatable viewport/result
 * sequence. The editor adapter owns fixture loading and restores user state.
 */
export async function runMaximumCanvasRenderRegression(
  preset: MaximumComponentRegressionPreset,
  runtime: CanvasRenderRegressionRuntime,
  options: CanvasRenderRegressionOptions = {},
): Promise<MaximumCanvasRenderTrace> {
  const framesPerViewport = Math.max(2, Math.trunc(options.framesPerViewport ?? 8));
  const shouldStop = options.shouldStop ?? (() => false);
  const scenarios = maximumCanvasRenderScenarios();
  const eventsByScenario = new Map<CanvasRenderScenarioId, CanvasRenderEvent[]>();
  const traces: CanvasRenderScenarioTrace[] = [];
  let activeScenario: CanvasRenderScenarioId | null = null;
  const stopInstrumentation = startCanvasRenderInstrumentation((event) => {
    if (!activeScenario) return;
    const events = eventsByScenario.get(activeScenario) || [];
    events.push(event);
    eventsByScenario.set(activeScenario, events);
  });

  try {
    for (const scenario of scenarios) {
      if (shouldStop()) break;
      activeScenario = scenario.id;
      eventsByScenario.set(scenario.id, []);
      const frameTimes: number[] = [];
      const streamSignatures: string[] = [];
      const initialCurrents = createCanvasRegressionWireCurrents(
        preset.wires.map((wire) => wire.id),
        0,
      );
      runtime.publishWireCurrents(initialCurrents);
      const currentSignatureBeforeSwitch = numericRecordSignature(runtime.getWireCurrents());
      const measurementSignatureBefore = runtime.getMeasurementConsumerSignature();
      runtime.setScenario(scenario.showCurrentFlow, scenario.qualityMode);
      const currentValuesStableOnQualitySwitch = currentSignatureBeforeSwitch
        === numericRecordSignature(runtime.getWireCurrents());
      const measurementConsumersStable = measurementSignatureBefore
        === runtime.getMeasurementConsumerSignature();

      for (let motionIndex = 0; motionIndex < scenario.viewportMotion.length; motionIndex += 1) {
        if (shouldStop()) break;
        const currents = createCanvasRegressionWireCurrents(
          preset.wires.map((wire) => wire.id),
          motionIndex,
        );
        runtime.publishWireCurrents(currents);
        streamSignatures.push(numericRecordSignature(currents));
        runtime.setViewport(scenario.viewportMotion[motionIndex]);
        frameTimes.push(...await waitForAnimationFrames(runtime, framesPerViewport, shouldStop));
      }

      traces.push(summarizeScenario(
        scenario,
        eventsByScenario.get(scenario.id) || [],
        frameTimes,
        streamSignatures.join('>'),
        currentValuesStableOnQualitySwitch,
        measurementConsumersStable,
        preset.wires.length,
      ));
    }
  } finally {
    activeScenario = null;
    stopInstrumentation();
  }

  const limited = traces.find((trace) => trace.id === 'limited');
  const full = traces.find((trace) => trace.id === 'full');
  return {
    fixtureId: preset.id,
    recordedAt: new Date().toISOString(),
    viewportWidth: runtime.viewportWidth,
    viewportHeight: runtime.viewportHeight,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    hardwareConcurrency: typeof navigator === 'undefined' ? 0 : navigator.hardwareConcurrency,
    userAgent: typeof navigator === 'undefined' ? 'non-browser' : navigator.userAgent,
    completed: traces.length === scenarios.length && !shouldStop(),
    sameOverviewMotion: Boolean(limited && full && limited.viewportMotionSignature === full.viewportMotionSignature),
    sameResultStream: Boolean(limited && full && limited.resultStreamSignature === full.resultStreamSignature),
    scenarios: traces,
  };
}
