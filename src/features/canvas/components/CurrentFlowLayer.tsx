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

export default function CurrentFlowLayer() {
  const isSimulating = useSimulationStore((s) => s.isSimulating);
  const showCurrentFlow = useSimulationStore((s) => s.showCurrentFlow);
  const currentFlowDirection = useSimulationStore((s) => s.currentFlowDirection);
  const wireCurrents = useSimulationStore((s) => s.wireCurrents);

  const wires = useCanvasStore((s) => s.wires);
  const nodesById = useCanvasStore((s) => s.nodesById);

  const shapeRef = useRef<Konva.Shape>(null);
  const animOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const wireCurrentsRef = useRef(wireCurrents);
  wireCurrentsRef.current = wireCurrents;

  const currentFlowDirRef = useRef(currentFlowDirection);
  currentFlowDirRef.current = currentFlowDirection;

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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      animOffsetRef.current += dt;
      shapeRef.current?.getLayer()?.batchDraw();
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isSimulating, showCurrentFlow]);

  if (!isSimulating || !showCurrentFlow) return null;

  return (
    <Layer listening={false}>
      <Shape
        ref={shapeRef}
        listening={false}
        sceneFunc={(context) => {
          const t = animOffsetRef.current;
          const currents = wireCurrentsRef.current;
          const isConventional = currentFlowDirRef.current === 'conventional';
          const paths = pathsRef.current;

          for (const path of paths) {
            const current = currents[path.wireId] ?? 0;
            const absI = Math.abs(current);
            if (absI < 1e-4) continue;

            const forward = current >= 0 ? isConventional : !isConventional;
            const speed = Math.min(Math.max(absI * 120, 25), 180);
            const color = getParticleColor(absI);

            const particleSpacing = 28;
            const count = Math.max(2, Math.floor(path.totalLength / particleSpacing));
            const travel = (t * speed) % path.totalLength;

            for (let i = 0; i < count; i++) {
              const basePos = (i * (path.totalLength / count));
              const dist = forward
                ? (basePos + travel) % path.totalLength
                : (path.totalLength - ((basePos + travel) % path.totalLength)) % path.totalLength;

              const pt = getPointAtDistance(path.segments, path.totalLength, dist);

              // Outer glow circle
              context.beginPath();
              context.arc(pt.x, pt.y, 3, 0, Math.PI * 2, false);
              context.fillStyle = color;
              context.globalAlpha = 0.4;
              context.fill();

              // Inner bright core
              context.beginPath();
              context.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2, false);
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

