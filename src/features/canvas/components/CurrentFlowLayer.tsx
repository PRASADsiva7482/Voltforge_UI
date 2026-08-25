import { useEffect, useMemo, useRef } from 'react';
import { Layer, Shape } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../../store/canvasStore';
import { useSimulationStore } from '../../../store/simulationStore';
import { getPinAbsPos, getWireRenderPoints } from '../../../utils/wireRouting';

interface PolylineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  cumLength: number;
}

interface StaticWirePath {
  wireId: string;
  totalLength: number;
  segments: PolylineSegment[];
}

// Keep the visual threshold below the solver's useful range. A current can be
// small during capacitor startup or on a high-impedance input, but it is still
// a real current and should not make the animation disappear unexpectedly.
const CURRENT_VISIBILITY_THRESHOLD_A = 1e-9;

function getPointAtDistance(segments: PolylineSegment[], totalLength: number, d: number): { x: number; y: number } {
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
}

export default function CurrentFlowLayer({ isSimulating: simulationProp }: CurrentFlowLayerProps) {
  const storeIsSimulating = useSimulationStore((s) => s.isSimulating);
  const showCurrentFlow = useSimulationStore((s) => s.showCurrentFlow);
  const currentFlowDirection = useSimulationStore((s) => s.currentFlowDirection);
  const wireCurrents = useSimulationStore((s) => s.wireCurrents);

  const wires = useCanvasStore((s) => s.wires);
  const nodesById = useCanvasStore((s) => s.nodesById);
  const viewportScale = useCanvasStore((s) => s.viewport.scale);

  const isSimulating = simulationProp ?? storeIsSimulating;
  const layerRef = useRef<Konva.Layer>(null);
  const shapeRef = useRef<Konva.Shape>(null);
  const animOffsetRef = useRef<number>(0);

  const wireCurrentsRef = useRef(wireCurrents);
  wireCurrentsRef.current = wireCurrents;

  const currentFlowDirRef = useRef(currentFlowDirection);
  currentFlowDirRef.current = currentFlowDirection;

  const viewportScaleRef = useRef(viewportScale);
  viewportScaleRef.current = viewportScale;

  // Precompute wire polyline segments only when wire/node topology changes
  const staticWirePaths = useMemo<StaticWirePath[]>(() => {
    const paths: StaticWirePath[] = [];

    for (const wire of wires) {
      const from = nodesById.get(wire.fromNodeId);
      const to = nodesById.get(wire.toNodeId);
      if (!from || !to) continue;

      const startPos = getPinAbsPos(from, wire.fromPinId);
      const endPos = getPinAbsPos(to, wire.toPinId);
      if (!startPos || !endPos) continue;

      const pts = getWireRenderPoints(wire, [from, to], wire.bendPoints || [], wires);
      if (pts.length < 4) continue;

      const segments: PolylineSegment[] = [];
      let totalLen = 0;
      for (let i = 0; i < pts.length - 2; i += 2) {
        const x1 = pts[i];
        const y1 = pts[i + 1];
        const x2 = pts[i + 2];
        const y2 = pts[i + 3];
        const len = Math.hypot(x2 - x1, y2 - y1);
        totalLen += len;
        segments.push({ x1, y1, x2, y2, length: len, cumLength: totalLen });
      }

      if (totalLen >= 5) {
        paths.push({
          wireId: wire.id,
          totalLength: totalLen,
          segments,
        });
      }
    }

    return paths;
  }, [wires, nodesById]);

  const pathsRef = useRef(staticWirePaths);
  pathsRef.current = staticWirePaths;

  useEffect(() => {
    if (!isSimulating || !showCurrentFlow) {
      return;
    }

    const layer = layerRef.current;
    if (!layer) return;

    // Konva.Animation owns both the frame clock and the layer redraw. Calling
    // batchDraw() from a separate RAF can be skipped while the Stage is being
    // transformed or another layer is committing simulation updates, which
    // makes the particles look static even though their offset is changing.
    const animation = new Konva.Animation((frame) => {
      const dt = Math.min(Math.max((frame?.timeDiff || 16) / 1000, 0), 0.05);
      animOffsetRef.current += dt;
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
        ref={shapeRef}
        listening={false}
        sceneFunc={(context) => {
          const t = animOffsetRef.current;
          const currents = wireCurrentsRef.current;
          const isConventional = currentFlowDirRef.current === 'conventional';
          const paths = pathsRef.current;

          for (const path of paths) {
            // Solver results are numeric, but persisted/remote layouts can
            // briefly contain string values. Normalize before Number.isFinite
            // so a valid current is never rejected by a type mismatch.
            const current = Number(currents[path.wireId] ?? 0);
            const absI = Math.abs(current);
            if (!Number.isFinite(absI) || absI < CURRENT_VISIBILITY_THRESHOLD_A) continue;

            const forward = current >= 0 ? isConventional : !isConventional;
            const speed = Math.min(Math.max(absI * 120, 25), 180);
            const color = getParticleColor(absI);

            const particleSpacing = 28;
            const count = Math.max(2, Math.floor(path.totalLength / particleSpacing));
            const travel = (t * speed) % path.totalLength;
            // Keep particles visible at both the overview zoom and close-up
            // zoom. Konva scales the whole layer with the stage, so compensate
            // in world units for the current viewport scale.
            const screenScale = Math.max(viewportScaleRef.current, 0.2);
            const outerRadius = 4 / screenScale;
            const coreRadius = 2 / screenScale;

            for (let i = 0; i < count; i++) {
              const basePos = (i * (path.totalLength / count));
              const dist = forward
                ? (basePos + travel) % path.totalLength
                : (path.totalLength - ((basePos + travel) % path.totalLength)) % path.totalLength;

              const pt = getPointAtDistance(path.segments, path.totalLength, dist);

              // Outer glow circle
              context.beginPath();
              context.arc(pt.x, pt.y, outerRadius, 0, Math.PI * 2, false);
              context.fillStyle = color;
              context.globalAlpha = 0.55;
              context.fill();

              // Inner bright core
              context.beginPath();
              context.arc(pt.x, pt.y, coreRadius, 0, Math.PI * 2, false);
              context.fillStyle = '#ffffff';
              context.globalAlpha = 1.0;
              context.fill();
            }
          }
        }}
      />
    </Layer>
  );
}
