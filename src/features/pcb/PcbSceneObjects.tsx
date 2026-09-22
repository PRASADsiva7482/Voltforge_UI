import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import Konva from 'konva';
import { Circle, Group, Line } from 'react-konva';
import type { PcbTrace, PcbVia } from '../../store/pcbStore';
import { BOARD_OFFSET_PX, SCALE_MM_TO_PX } from './pcbSceneGeometry';
import { TraceRouter } from './TraceRouter';
import { cachePcbNode, type PcbRasterBudget } from './pcbRasterBudget';

const ratlineDash = [4, 4];
export const PcbRatline = memo(function PcbRatline({ points }: { points: number[] }) {
  return <Line name="pcb-ratline" points={points} stroke="#cbd5e1" strokeWidth={1} dash={ratlineDash} opacity={0.6} />;
}, (a, b) => a.points === b.points || a.points.every((value, i) => value === b.points[i]));

export const PcbTraceShape = memo(function PcbTraceShape({ trace, points, onSelect, rasterBudget }: {
  trace: PcbTrace; points: number[]; onSelect: (id: string) => void; rasterBudget: PcbRasterBudget;
}) {
  const ref = useRef<Konva.Line>(null);
  // Cache in local coordinates: Konva's temporary buffer otherwise grows with
  // the trace's distance from the board origin, even for a tiny visible trace.
  const x = points[0] ?? 0, y = points[1] ?? 0;
  const localPoints = useMemo(() => points.map((value, i) => value - (i % 2 ? y : x)), [points, x, y]);
  useLayoutEffect(() => {
    if (ref.current) return cachePcbNode(ref.current, rasterBudget, 3 * Konva.pixelRatio);
  }, [trace, points, rasterBudget]);
  const color = trace.layer === 'F.Cu' ? '#ef4444' : '#38bdf8';
  return <Line ref={ref} name="pcb-trace" id={trace.id} x={x} y={y} points={localPoints} stroke={color}
    strokeWidth={trace.width_mm * SCALE_MM_TO_PX * 2.5} lineCap="round" lineJoin="round"
    opacity={0.85} shadowColor={color} shadowBlur={4}
    onClick={e => { e.cancelBubble = true; onSelect(trace.id); }} />;
});

export const PcbViaShape = memo(function PcbViaShape({ via, readOnly, detailed, onDragStart, onDragEnd }: {
  via: PcbVia; readOnly: boolean; detailed: boolean; onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}) {
  const x = via.x * SCALE_MM_TO_PX + BOARD_OFFSET_PX, y = via.y * SCALE_MM_TO_PX + BOARD_OFFSET_PX;
  return <Group name="pcb-via" id={via.id} x={x} y={y} draggable={!readOnly}
    onDragStart={() => onDragStart(via.id)}
    onDragEnd={e => {
      onDragEnd(via.id, TraceRouter.snapToGrid((e.target.x() - BOARD_OFFSET_PX) / SCALE_MM_TO_PX),
        TraceRouter.snapToGrid((e.target.y() - BOARD_OFFSET_PX) / SCALE_MM_TO_PX));
      if (readOnly) e.target.position({ x, y });
    }}>
    <Circle radius={via.pad_mm * SCALE_MM_TO_PX * 2} fill="#facc15" stroke="#ca8a04" strokeWidth={1} />
    {detailed && <Circle radius={via.drill_mm * SCALE_MM_TO_PX * 2} fill="#090d16" />}
  </Group>;
});
