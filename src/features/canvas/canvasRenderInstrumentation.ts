import type { CurrentFlowQualityMode, CurrentFlowRenderBudget, ViewportTransform } from './renderBudget';

interface CanvasRenderEventBase {
  timestampMs: number;
}

export interface CanvasLayoutRenderEvent extends CanvasRenderEventBase {
  kind: 'canvas-layout';
  viewport: ViewportTransform;
  viewportWidth: number;
  viewportHeight: number;
  totalWireCount: number;
  mountedWireShapeCount: number;
  totalComponentCount?: number;
  mountedComponentCount?: number;
  mountedPinCount?: number;
  currentFlowEnabled: boolean;
  qualityMode: CurrentFlowQualityMode;
  budgetLimited: boolean;
  configuredFrameIntervalMs: number;
  configuredParticleCap: number | null;
  configuredPerWireParticleCap: number | null;
}

export interface CurrentFlowCompileEvent extends CanvasRenderEventBase {
  kind: 'flow-compile';
  currentFlowEnabled: boolean;
  visibleWireCount: number;
  compiledFlowPathCount: number;
}

export interface CurrentFlowDrawEvent extends CanvasRenderEventBase {
  kind: 'flow-draw';
  compiledFlowPathCount: number;
  activeFlowPathCount: number;
  particleDrawCount: number;
  maximumParticlesOnSinglePath: number;
  drawCpuTimeMs: number;
  targetFrameIntervalMs: number;
}

export type CanvasRenderEvent = CanvasLayoutRenderEvent | CurrentFlowCompileEvent | CurrentFlowDrawEvent;
export type CanvasRenderEventListener = (event: CanvasRenderEvent) => void;

let activeListener: CanvasRenderEventListener | null = null;

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function startCanvasRenderInstrumentation(listener: CanvasRenderEventListener): () => void {
  if (activeListener) throw new Error('A canvas rendering trace is already active');
  activeListener = listener;
  return () => {
    if (activeListener === listener) activeListener = null;
  };
}

export function isCanvasRenderInstrumentationActive(): boolean {
  return activeListener !== null;
}

export function recordCanvasLayout(
  event: Omit<CanvasLayoutRenderEvent, 'kind' | 'timestampMs'>,
): void {
  activeListener?.({ kind: 'canvas-layout', timestampMs: nowMs(), ...event });
}

export function recordCurrentFlowCompilation(
  event: Omit<CurrentFlowCompileEvent, 'kind' | 'timestampMs'>,
): void {
  activeListener?.({ kind: 'flow-compile', timestampMs: nowMs(), ...event });
}

export function recordCurrentFlowDraw(
  event: Omit<CurrentFlowDrawEvent, 'kind' | 'timestampMs'>,
): void {
  activeListener?.({ kind: 'flow-draw', timestampMs: nowMs(), ...event });
}

export function canvasLayoutBudgetFields(budget: CurrentFlowRenderBudget) {
  return {
    qualityMode: budget.qualityMode,
    budgetLimited: budget.isLimited,
    configuredFrameIntervalMs: budget.frameIntervalMs,
    configuredParticleCap: Number.isFinite(budget.maxParticles) ? budget.maxParticles : null,
    configuredPerWireParticleCap: Number.isFinite(budget.maxParticlesPerWire)
      ? budget.maxParticlesPerWire
      : null,
  };
}
