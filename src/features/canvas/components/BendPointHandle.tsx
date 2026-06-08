import { useState } from 'react';
import { Circle } from 'react-konva';
import { useCanvasStore } from '../../../store/canvasStore';
import { getPinAbsPos, snapToRoutingGuides } from '../../../utils/wireRouting';
import {
  BEND_POINT_RADIUS_DEFAULT,
  BEND_POINT_RADIUS_HOVERED,
  BEND_POINT_FILL_DEFAULT,
  BEND_POINT_FILL_HOVERED,
  BEND_POINT_STROKE,
} from '../canvasConstants';
import type { WireBendPoint } from '../canvasTypes';
import type { KonvaEventObject } from 'konva/lib/Node';

interface BendPointHandleProps {
  wireId: string;
  index: number;
  point: WireBendPoint;
}

/** Draggable circle handle for wire bend points. */
const BendPointHandle = ({ wireId, index, point }: BendPointHandleProps) => {
  const { updateBendPoint, removeBendPoint } = useCanvasStore();
  const [hovered, setHovered] = useState(false);

  return (
    <Circle
      x={point.x}
      y={point.y}
      radius={hovered ? BEND_POINT_RADIUS_HOVERED : BEND_POINT_RADIUS_DEFAULT}
      fill={hovered ? BEND_POINT_FILL_HOVERED : BEND_POINT_FILL_DEFAULT}
      stroke={BEND_POINT_STROKE}
      strokeWidth={2}
      shadowColor={BEND_POINT_STROKE}
      shadowBlur={hovered ? 10 : 4}
      draggable
      onDragMove={(e: KonvaEventObject<DragEvent>) => {
        const state = useCanvasStore.getState();
        const anchors = state.nodes.flatMap((node) =>
          node.pins
            .map((pin) => getPinAbsPos(node, pin.id))
            .filter(Boolean) as { x: number; y: number }[]
        );
        const snapped = snapToRoutingGuides(
          { x: e.target.x(), y: e.target.y() },
          anchors
        );
        updateBendPoint(wireId, index, snapped);
      }}
      onDblClick={(e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        removeBendPoint(wireId, index);
      }}
      onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
        setHovered(true);
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'grab';
      }}
      onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
        setHovered(false);
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = 'default';
      }}
    />
  );
};

export default BendPointHandle;
