import { hydrateCanvasNode } from '../componentFactory';
import type { Wire } from '../canvasTypes';
import {
  compileCurrentFlowPaths,
  createCurrentFlowRenderBudget,
  cullWiresToViewport,
  planCurrentFlowParticles,
  type CurrentFlowPath,
  type CurrentFlowQualityMode,
  type CurrentFlowRenderBudget,
  type ViewportTransform,
} from '../renderBudget';
import {
  canvasLayoutBudgetFields,
  recordCanvasLayout,
  recordCurrentFlowCompilation,
  recordCurrentFlowDraw,
} from '../canvasRenderInstrumentation';
import {
  createCanvasRegressionWireCurrents,
  maximumCanvasRenderScenarios,
  runMaximumCanvasRenderRegression,
} from './canvasRenderRegression';
import { createMaximumComponentRegressionPreset } from '../../../store/maxComponentRegressionPreset';
import { useSimulationStore } from '../../../store/simulationStore';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Canvas render budget contract failed: ${message}`);
}

function testWire(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  fromPinId = 'p1',
  toPinId = 'p2',
): Wire {
  return {
    id,
    fromNodeId,
    fromPinId,
    toNodeId,
    toPinId,
    color: '#64748b',
    label: id,
    bendPoints: [],
    routingMode: 'straight',
  };
}

function assertViewportCullingAndCompilation(): void {
  const nodes = [
    hydrateCanvasNode({ id: 'near_a', name: 'Near A', type: 'RESISTOR', x: 20, y: 80 }),
    hydrateCanvasNode({ id: 'near_b', name: 'Near B', type: 'RESISTOR', x: 360, y: 80 }),
    hydrateCanvasNode({ id: 'cross_a', name: 'Cross A', type: 'RESISTOR', x: -500, y: 220 }),
    hydrateCanvasNode({ id: 'cross_b', name: 'Cross B', type: 'RESISTOR', x: 900, y: 220 }),
    hydrateCanvasNode({ id: 'far_a', name: 'Far A', type: 'RESISTOR', x: 2_000, y: 2_000 }),
    hydrateCanvasNode({ id: 'far_b', name: 'Far B', type: 'RESISTOR', x: 2_300, y: 2_000 }),
  ];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const wires = [
    testWire('near', 'near_a', 'near_b'),
    testWire('crossing', 'cross_a', 'cross_b'),
    testWire('far', 'far_a', 'far_b'),
  ];
  const visible = cullWiresToViewport(wires, nodesById, { x: 0, y: 0, scale: 1 }, 500, 320);
  assert(visible.some((wire) => wire.id === 'near'), 'wire inside viewport overscan must remain mounted');
  assert(visible.some((wire) => wire.id === 'crossing'), 'straight segment crossing the viewport must remain mounted');
  assert(!visible.some((wire) => wire.id === 'far'), 'wire outside viewport overscan must not mount');

  const compiled = compileCurrentFlowPaths(visible, nodesById, wires);
  assert(compiled.length === visible.length, 'flow compiler must compile each valid visible wire');
  assert(!compiled.some((path) => path.wireId === 'far'), 'flow compiler must never compile culled geometry');

  const maximumPreset = createMaximumComponentRegressionPreset();
  const maximumNodesById = new Map(maximumPreset.nodes.map((node) => [node.id, node]));
  const offscreen = cullWiresToViewport(
    maximumPreset.wires,
    maximumNodesById,
    { x: -10_000, y: -10_000, scale: 1 },
    800,
    600,
  );
  assert(offscreen.length === 0, 'maximum preset must mount zero wires when the viewport is fully outside its geometry');
}

function syntheticPaths(count: number, wireIds?: readonly string[]): CurrentFlowPath[] {
  return Array.from({ length: count }, (_, index) => ({
    wireId: wireIds?.[index] || `wire_${index}`,
    totalLength: 1_000,
    segments: [{ x1: 0, y1: index, x2: 1_000, y2: index, length: 1_000, cumLength: 1_000 }],
  }));
}

function assertParticleBudgets(): void {
  const adaptive = createCurrentFlowRenderBudget('adaptive', 1, 40, 800, 600);
  assert(!adaptive.isLimited && adaptive.frameIntervalMs === 16, 'ordinary adaptive viewport must retain full cadence');
  assert(!Number.isFinite(adaptive.maxParticles), 'ordinary adaptive viewport must not impose a particle cap');

  const dense = createCurrentFlowRenderBudget('adaptive', 1, 100, 800, 600);
  assert(dense.isLimited && dense.frameIntervalMs === 33, 'dense adaptive wiring must reduce animation cadence');

  const limited = createCurrentFlowRenderBudget('adaptive', 0.45, 240, 800, 600);
  assert(limited.isLimited && limited.frameIntervalMs === 50, 'overview adaptive wiring must use overview cadence');
  assert(Number.isFinite(limited.maxParticles) && Number.isFinite(limited.maxParticlesPerWire), 'limited mode must have global and per-wire caps');

  const full = createCurrentFlowRenderBudget('full', 0.45, 240, 800, 600);
  assert(!full.isLimited && full.frameIntervalMs === 16, 'Full detail must restore normal cadence');
  assert(!Number.isFinite(full.maxParticles) && !Number.isFinite(full.maxParticlesPerWire), 'Full detail must remove visual particle caps');

  const paths = syntheticPaths(240);
  const currents = Object.fromEntries(paths.map((path) => [path.wireId, 0.01]));
  const limitedPlan = planCurrentFlowParticles(paths, currents, limited);
  assert(limitedPlan.particleCount <= limited.maxParticles, 'limited particle plan must observe its global cap');
  assert(
    limitedPlan.paths.every((path) => path.particleCount <= limited.maxParticlesPerWire),
    'limited particle plan must observe its per-wire cap',
  );
  const fullPlan = planCurrentFlowParticles(paths, currents, full);
  assert(fullPlan.particleCount > limitedPlan.particleCount, 'Full detail must remove adaptive particle reductions');
}

function assertQualityIsolation(): void {
  const original = useSimulationStore.getState();
  const nextMode: CurrentFlowQualityMode = original.currentFlowQualityMode === 'full' ? 'adaptive' : 'full';
  const wireCurrents = original.wireCurrents;
  const nodeVoltages = original.nodeVoltages;
  const branchCurrents = original.branchCurrents;
  const componentPower = original.componentPower;
  const meterProbes = original.meterProbes;
  const resultConsumers = original.resultDataConsumers;

  original.setCurrentFlowQualityMode(nextMode);
  const switched = useSimulationStore.getState();
  assert(switched.wireCurrents === wireCurrents, 'quality switch must preserve solved wire-current reference');
  assert(switched.nodeVoltages === nodeVoltages, 'quality switch must preserve solved node-voltage reference');
  assert(switched.branchCurrents === branchCurrents, 'quality switch must preserve branch-current consumers');
  assert(switched.componentPower === componentPower, 'quality switch must preserve power consumers');
  assert(switched.meterProbes === meterProbes, 'quality switch must preserve meter probes');
  assert(switched.resultDataConsumers === resultConsumers, 'quality switch must preserve AI/lab result demand');
  switched.setCurrentFlowQualityMode(original.currentFlowQualityMode);
}

async function assertBrowserTraceController(): Promise<void> {
  const preset = createMaximumComponentRegressionPreset();
  let timestampMs = 0;
  let showCurrentFlow = false;
  let qualityMode: CurrentFlowQualityMode = 'adaptive';
  let viewport: ViewportTransform = { x: 0, y: 0, scale: 1 };
  let wireCurrents: Record<string, number> = {};
  let budget: CurrentFlowRenderBudget = createCurrentFlowRenderBudget('adaptive', 1, 24, 800, 600);
  let lastDrawAtMs = Number.NEGATIVE_INFINITY;
  const paths = syntheticPaths(preset.wires.length, preset.wires.map((wire) => wire.id));

  const trace = await runMaximumCanvasRenderRegression(preset, {
    viewportWidth: 800,
    viewportHeight: 600,
    setScenario: (show, quality) => {
      showCurrentFlow = show;
      qualityMode = quality;
    },
    setViewport: (nextViewport) => {
      viewport = { ...nextViewport };
      budget = createCurrentFlowRenderBudget(qualityMode, viewport.scale, paths.length, 800, 600);
      recordCanvasLayout({
        viewport,
        viewportWidth: 800,
        viewportHeight: 600,
        totalWireCount: preset.wires.length,
        mountedWireShapeCount: 24,
        currentFlowEnabled: showCurrentFlow,
        ...canvasLayoutBudgetFields(budget),
      });
      recordCurrentFlowCompilation({
        currentFlowEnabled: showCurrentFlow,
        visibleWireCount: 24,
        compiledFlowPathCount: showCurrentFlow ? paths.length : 0,
      });
    },
    publishWireCurrents: (nextCurrents) => {
      wireCurrents = { ...nextCurrents };
    },
    getWireCurrents: () => wireCurrents,
    getMeasurementConsumerSignature: () => 'meter:voltage|ai:false|lab:false',
    now: () => timestampMs,
    requestFrame: (callback) => {
      timestampMs += 16;
      if (showCurrentFlow && timestampMs - lastDrawAtMs >= budget.frameIntervalMs) {
        lastDrawAtMs = timestampMs;
        const plan = planCurrentFlowParticles(paths, wireCurrents, budget);
        recordCurrentFlowDraw({
          compiledFlowPathCount: paths.length,
          activeFlowPathCount: plan.activePathCount,
          particleDrawCount: plan.particleCount,
          maximumParticlesOnSinglePath: plan.paths.reduce(
            (maximum, path) => Math.max(maximum, path.particleCount),
            0,
          ),
          drawCpuTimeMs: 0.2,
          targetFrameIntervalMs: budget.frameIntervalMs,
        });
      }
      callback(timestampMs);
      return Math.trunc(timestampMs);
    },
  });

  assert(trace.completed && trace.scenarios.length === 4, 'browser controller must complete all four rendering scenarios');
  assert(trace.sameOverviewMotion, 'limited Adaptive and Full detail must use identical viewport motion');
  assert(trace.sameResultStream, 'limited Adaptive and Full detail must use identical current-result streams');
  const disabled = trace.scenarios.find((scenario) => scenario.id === 'disabled');
  const adaptive = trace.scenarios.find((scenario) => scenario.id === 'adaptive');
  const limited = trace.scenarios.find((scenario) => scenario.id === 'limited');
  const full = trace.scenarios.find((scenario) => scenario.id === 'full');
  assert(disabled?.compiledFlowPathCount === 0 && disabled.gpuActivity.canvasDrawCount === 0, 'disabled scenario must compile and draw no current-flow paths');
  assert(adaptive?.configuredFrameIntervalMs === 16, 'ordinary adaptive fixture must retain normal cadence');
  assert(limited?.budgetLimitedObserved && limited.configuredParticleCap !== null, 'limited scenario must report its active budget');
  assert(limited?.particleCapsObserved, 'limited browser trace must observe global and per-wire caps');
  assert(full?.configuredParticleCap === null && full.configuredPerWireParticleCap === null, 'Full detail trace must report unlimited caps');
  assert(
    Boolean(full && limited && full.maximumParticlesPerDraw > limited.maximumParticlesPerDraw),
    'Full detail trace must submit more particles than the identical limited viewport stream',
  );
  assert(trace.scenarios.every((scenario) => scenario.currentValuesStableOnQualitySwitch), 'all quality transitions must preserve solved currents');
  assert(trace.scenarios.every((scenario) => scenario.measurementConsumersStable), 'all quality transitions must preserve measurement consumers');

  const scenarios = maximumCanvasRenderScenarios();
  assert(
    createCanvasRegressionWireCurrents(preset.wires.map((wire) => wire.id), 1).max_wire_supply_board
      === createCanvasRegressionWireCurrents(preset.wires.map((wire) => wire.id), 1).max_wire_supply_board,
    'deterministic current stream must be reproducible',
  );
  assert(scenarios[2].viewportMotion.length === scenarios[3].viewportMotion.length, 'limited/full motion lengths must match');
}

/** Deterministic culling, particle-policy, store-isolation, and trace assertions. */
export async function assertCanvasRenderBudgetContract(): Promise<void> {
  assertViewportCullingAndCompilation();
  assertParticleBudgets();
  assertQualityIsolation();
  await assertBrowserTraceController();
}
