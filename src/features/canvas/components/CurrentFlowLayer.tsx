import { useEffect, useMemo, useRef } from 'react';
import { Layer, Shape } from 'react-konva';
import Konva from 'konva';
import type { CanvasNode } from '../../../types/domain';
import { useSimulationStore } from '../../../store/simulationStore';
import {
  compileCurrentFlowPaths,
  planCurrentFlowParticles,
  type CurrentFlowPath,
  type CurrentFlowPolylineSegment,
  type CurrentFlowRenderBudget,
} from '../renderBudget';
import {
  isCanvasRenderInstrumentationActive,
  recordCurrentFlowCompilation,
  recordCurrentFlowDraw,
} from '../canvasRenderInstrumentation';
import type { Wire } from '../canvasTypes';

function getPointAtDistance(segments: CurrentFlowPolylineSegment[], totalLength: number, d: number): { x: number; y: number } {
  const normD = ((d % totalLength) + totalLength) % totalLength;
  for (const seg of segments) {
    if (normD <= seg.cumLength) {
      const segStart = seg.cumLength - seg.length;
      const t = seg.length > 0 ? (normD - segStart) / seg.length : 0;
      return {
        x: seg.x1 + t * (seg.x2 - seg.x1),
        y: seg.y1 + t * (seg.y2 - seg.y1),
      };
    }
  }
  const last = segments[segments.length - 1];
  return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
}

function getParticleColor(absCurrentA: number): string {
  if (absCurrentA < 0.01) return '#38bdf8'; // Cyan (< 10mA)
  if (absCurrentA < 0.1) return '#4ade80';  // Green (10mA - 100mA)
  if (absCurrentA < 0.5) return '#facc15';  // Yellow (100mA - 500mA)
  return '#f87171';                         // Red (> 500mA)
}

interface CurrentFlowLayerProps {
  /** The editor owns the visual simulation lifecycle. */
  isSimulating?: boolean;
  visibleWires: Wire[];
  allWires: Wire[];
  nodesById: ReadonlyMap<string, CanvasNode>;
  viewportScale: number;
  budget: CurrentFlowRenderBudget;
}

export default function CurrentFlowLayer({
  isSimulating: simulationProp,
  visibleWires,
  allWires,
  nodesById,
  viewportScale,
  budget,
}: CurrentFlowLayerProps) {
  const storeIsSimulating = useSimulationStore((s) => s.isSimulating);
  const showCurrentFlow = useSimulationStore((s) => s.showCurrentFlow);
  const currentFlowDirection = useSimulationStore((s) => s.currentFlowDirection);
  const wireCurrents = useSimulationStore((s) => s.wireCurrents);

  const isSimulating = simulationProp ?? storeIsSimulating;
  const layerRef = useRef<Konva.Layer>(null);
  const animOffsetRef = useRef<number>(0);

  const wireCurrentsRef = useRef(wireCurrents);
  wireCurrentsRef.current = wireCurrents;

  const currentFlowDirRef = useRef(currentFlowDirection);
  currentFlowDirRef.current = currentFlowDirection;

  const viewportScaleRef = useRef(viewportScale);
  viewportScaleRef.current = viewportScale;

  const budgetRef = useRef(budget);
  budgetRef.current = budget;

  // Only visible wire geometry is compiled into animation paths. Panning or
  // zooming swaps this bounded path set; solver current values remain intact.
  const flowEnabled = isSimulating && showCurrentFlow;
  const staticWirePaths = useMemo<CurrentFlowPath[]>(
    () => flowEnabled ? compileCurrentFlowPaths(visibleWires, nodesById, allWires) : [],
    [flowEnabled, visibleWires, allWires, nodesById],
  );

  const pathsRef = useRef(staticWirePaths);
  pathsRef.current = staticWirePaths;

  useEffect(() => {
    recordCurrentFlowCompilation({
      currentFlowEnabled: flowEnabled,
      visibleWireCount: visibleWires.length,
      compiledFlowPathCount: staticWirePaths.length,
    });
  }, [flowEnabled, staticWirePaths, visibleWires.length]);

  useEffect(() => {
    if (!isSimulating || !showCurrentFlow) return;

    const layer = layerRef.current;
    if (!layer) return;

    let pendingTimeMs = 0;
    const animation = new Konva.Animation((frame) => {
      pendingTimeMs += Math.min(Math.max(frame?.timeDiff || 16, 0), 100);
      const frameIntervalMs = budgetRef.current.frameIntervalMs;
      if (pendingTimeMs < frameIntervalMs) return false;

      const elapsedMs = pendingTimeMs;
      pendingTimeMs = 0;
      animOffsetRef.current += Math.min(elapsedMs / 1000, 0.1);
      return true;
    }, layer);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [isSimulating, showCurrentFlow]);

  if (!isSimulating || !showCurrentFlow) return null;

  return (
    <Layer ref={layerRef} listening={false}>
      <Shape
        listening={false}
        sceneFunc={(context) => {
          const t = animOffsetRef.current;
          const currents = wireCurrentsRef.current;
          const isConventional = currentFlowDirRef.current === 'conventional';
          const paths = pathsRef.current;
          const activeBudget = budgetRef.current;
          const tracing = isCanvasRenderInstrumentationActive();
          const drawStartedAtMs = tracing ? performance.now() : 0;
          const particlePlan = planCurrentFlowParticles(
            paths,
            currents,
            activeBudget,
            Math.floor(t / 2),
          );

          for (const plannedPath of particlePlan.paths) {
            const { path, currentA: current, particleCount: count } = plannedPath;

            // Solver results are numeric, but persisted/remote layouts can
            // briefly contain string values. Normalize before Number.isFinite
            // so a valid current is never rejected by a type mismatch.
            const absI = Math.abs(current);

            const forward = current >= 0 ? isConventional : !isConventional;
            const speed = Math.min(Math.max(absI * 120, 25), 180);
            const color = getParticleColor(absI);
            const travel = (t * speed) % path.totalLength;
            const screenScale = Math.max(viewportScaleRef.current, 0.2);
            const particleRadius = 3 / screenScale;

            for (let i = 0; i < count; i += 1) {
              const basePos = i * (path.totalLength / count);
              const dist = forward
                ? (basePos + travel) % path.totalLength
                : (path.totalLength - ((basePos + travel) % path.totalLength)) % path.totalLength;

              const pt = getPointAtDistance(path.segments, path.totalLength, dist);
              context.beginPath();
              context.arc(pt.x, pt.y, particleRadius, 0, Math.PI * 2, false);
              context.fillStyle = color;
              context.globalAlpha = 0.82;
              context.fill();
              context.globalAlpha = 1.0;
            }
          }

          if (tracing) {
            recordCurrentFlowDraw({
              compiledFlowPathCount: paths.length,
              activeFlowPathCount: particlePlan.activePathCount,
              particleDrawCount: particlePlan.particleCount,
              maximumParticlesOnSinglePath: particlePlan.paths.reduce(
                (maximum, path) => Math.max(maximum, path.particleCount),
                0,
              ),
              drawCpuTimeMs: Math.max(0, performance.now() - drawStartedAtMs),
              targetFrameIntervalMs: activeBudget.frameIntervalMs,
            });
          }
        }}
      />
    </Layer>
  );
}
