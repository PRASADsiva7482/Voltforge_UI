import { Circle, Line, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { getPinAbsPos, distToSegment, getWireRenderPoints } from '../../../utils/wireRouting';
import type { CanvasNode, Wire, ActiveBendPoint } from '../canvasTypes';
import BendPointHandle from './BendPointHandle';
import {
  WIRE_HIT_STROKE_WIDTH,
  WIRE_OUTLINE_DARK,
  WIRE_OUTLINE_LIGHT,
  WIRE_SELECTED_WIDTH,
  WIRE_DEFAULT_WIDTH,
  WIRE_OUTLINE_SELECTED_WIDTH,
  WIRE_OUTLINE_DEFAULT_WIDTH,
  BEND_POINT_FILL_HOVERED,
  BEND_POINT_STROKE,
} from '../canvasConstants';

interface WireShapeProps {
  wire: Wire;
  nodes: CanvasNode[];
  wires: Wire[];
  isSelected: boolean;
  isDark: boolean;
  onSelect: () => void;
  onWireDragStart: (wireId: string, index: number, x: number, y: number) => void;
  activeNewBendPoint: ActiveBendPoint | null;
}

/** Renders a single wire with outline, bend point handles, and label. */
const WireShape = ({
  wire,
  nodes,
  wires,
  isSelected,
  isDark,
  onSelect,
  onWireDragStart,
  activeNewBendPoint,
}: WireShapeProps) => {
  const from = nodes.find((n) => n.id === wire.fromNodeId);
  const to = nodes.find((n) => n.id === wire.toNodeId);
  if (!from || !to) return null;

  const startPos = getPinAbsPos(from, wire.fromPinId);
  const endPos = getPinAbsPos(to, wire.toPinId);
  if (!startPos || !endPos) return null;

  // Insert phantom bend point if actively dragging a new one
  const currentBendPoints = [...(wire.bendPoints || [])];
  if (activeNewBendPoint && activeNewBendPoint.wireId === wire.id) {
    currentBendPoints.splice(activeNewBendPoint.index, 0, {
      x: activeNewBendPoint.x,
      y: activeNewBendPoint.y,
    });
  }

  const allPoints = getWireRenderPoints(wire, nodes, currentBendPoints, wires);

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onSelect();
  };

  const handleDoubleClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    if (wire.routingMode === 'auto') return;

    const stage = e.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;
    const x = pos.x;
    const y = pos.y;

    const allPts = [startPos, ...(wire.bendPoints || []), endPos];
    let bestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < allPts.length - 1; i++) {
      const d = distToSegment(x, y, allPts[i], allPts[i + 1]);
      if (d < minD) {
        minD = d;
        bestIdx = i;
      }
    }
    onWireDragStart(wire.id, bestIdx, x, y);
  };

  const tension = wire.routingMode === 'curved' ? 0.4 : 0;

  return (
    <>
      {/* Dark outline for wire separation — prevents merging of adjacent wires */}
      <Line
        points={allPoints}
        stroke={isDark ? WIRE_OUTLINE_DARK : WIRE_OUTLINE_LIGHT}
        strokeWidth={isSelected ? WIRE_OUTLINE_SELECTED_WIDTH : WIRE_OUTLINE_DEFAULT_WIDTH}
        tension={tension}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {/* Main wire line */}
      <Line
        points={allPoints}
        stroke={isSelected ? (isDark ? '#ffffff' : '#0f172a') : wire.color}
        strokeWidth={isSelected ? WIRE_SELECTED_WIDTH : WIRE_DEFAULT_WIDTH}
        tension={tension}
        lineCap="round"
        lineJoin="round"
        shadowColor={wire.color}
        shadowBlur={isSelected ? 10 : 4}
        shadowOpacity={0.6}
        hitStrokeWidth={WIRE_HIT_STROKE_WIDTH}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = isSelected ? 'pointer' : 'default';
        }}
        onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'default';
        }}
      />

      {/* Real Bend point circles */}
      {isSelected &&
        wire.routingMode !== 'auto' &&
        (wire.bendPoints || []).map((bp, idx) => (
          <BendPointHandle key={`bp_${wire.id}_${idx}`} wireId={wire.id} index={idx} point={bp} />
        ))}

      {/* Phantom active drag bend point */}
      {activeNewBendPoint && activeNewBendPoint.wireId === wire.id && (
        <Circle
          x={activeNewBendPoint.x}
          y={activeNewBendPoint.y}
          radius={6}
          fill={BEND_POINT_FILL_HOVERED}
          stroke={BEND_POINT_STROKE}
          strokeWidth={2}
        />
      )}

      {/* Wire label */}
      {wire.label && (
        <Text
          x={(startPos.x + endPos.x) / 2 - 20}
          y={(startPos.y + endPos.y) / 2 - 12}
          text={wire.label}
          fontSize={9}
          fontFamily="Inter"
          fill={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.72)'}
          padding={2}
        />
      )}
    </>
  );
};

export default WireShape;
