import { memo, useState } from 'react';
import { Group, Circle, Line, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasNode, PinPosition } from '../canvasTypes';
import { PinVoltageTooltip } from './ProbeVoltageTooltip';
import {
  PIN_COLOR_POWER,
  PIN_COLOR_GROUND,
  PIN_COLOR_DEFAULT,
  PIN_GLOW_POWER,
  PIN_GLOW_GROUND,
  PIN_GLOW_DEFAULT,
  PIN_HIT_STROKE_WIDTH,
  PIN_RADIUS_DEFAULT,
  PIN_RADIUS_HOVERED,
  PIN_SNAP_RADIUS_DEFAULT,
  PIN_SNAP_RADIUS_HOVERED,
  WIRING_PREVIEW_COLOR,
  WIRING_SOURCE_HIGHLIGHT,
} from '../canvasConstants';

interface PinDotProps {
  pin: PinPosition;
  nodeId: string;
  node: Pick<CanvasNode, 'width' | 'height' | 'type'>;
  isWiring: boolean;
  wiringFromNodeId: string | null;
  isDark: boolean;
  startWiring: (nodeId: string, pinId: string) => void;
  finishWiring: (nodeId: string, pinId: string) => void;
  readOnly?: boolean;
  isProbeMode?: boolean;
  detailed?: boolean;
  onProbeToggle?: (target: { nodeId: string; pinId: string; x: number; y: number }) => void;
}

function resolvePinColors(type: PinPosition['type']) {
  const fill =
    type === 'power'
      ? PIN_COLOR_POWER
      : type === 'ground'
        ? PIN_COLOR_GROUND
        : PIN_COLOR_DEFAULT;

  const glow =
    type === 'power'
      ? PIN_GLOW_POWER
      : type === 'ground'
        ? PIN_GLOW_GROUND
        : PIN_GLOW_DEFAULT;

  return { fill, glow };
}

function computeLabelLayout(pin: PinPosition, node: Pick<CanvasNode, 'width' | 'height'>) {
  const isLeft = pin.x <= 5;
  const isRight = pin.x >= node.width - 5;
  const isTop = pin.y <= 5;
  const isBottom = pin.y >= node.height - 5;

  let labelX: number;
  let labelY: number;
  let rotation: number;
  let labelWidth: number | undefined;
  let labelAlign: string | undefined;

  if (isLeft) {
    rotation = 0;
    labelX = pin.x + 10;
    labelY = pin.y - 4;
    labelAlign = 'left';
  } else if (isRight) {
    rotation = 0;
    labelX = pin.x - 50;
    labelY = pin.y - 4;
    labelWidth = 42;
    labelAlign = 'right';
  } else if (isTop) {
    rotation = -90;
    labelX = pin.x - 3;
    labelY = pin.y + 10;
  } else if (isBottom) {
    rotation = -90;
    labelX = pin.x - 3;
    labelY = pin.y - 10;
    labelWidth = 42;
    labelAlign = 'right';
  } else {
    const isTopHalf = pin.y < node.height / 2;
    rotation = -90;
    labelX = pin.x - 3;
    labelY = isTopHalf ? pin.y + 10 : pin.y - 10;
    labelWidth = isTopHalf ? undefined : 42;
    labelAlign = isTopHalf ? undefined : 'right';
  }

  return { labelX, labelY, rotation, labelWidth, labelAlign };
}

const PinDot = memo(function PinDot({
  pin,
  nodeId,
  node,
  isWiring,
  wiringFromNodeId,
  isDark,
  startWiring,
  finishWiring,
  readOnly = false,
  isProbeMode,
  detailed = true,
  onProbeToggle,
}: PinDotProps) {
  const [hovered, setHovered] = useState(false);
  const isValidTarget = isWiring && wiringFromNodeId !== nodeId;
  const { fill: pinColor, glow: glowColor } = resolvePinColors(pin.type);

  const { labelX, labelY, rotation, labelWidth, labelAlign } = computeLabelLayout(pin, node);

  return (
    <Group name="schematic-pin" id={`${nodeId}:${pin.id}`}>
      {/* Magnetic snap zone */}
      {isValidTarget && (
        <>
          <Circle
            x={pin.x}
            y={pin.y}
            radius={hovered ? PIN_SNAP_RADIUS_HOVERED : PIN_SNAP_RADIUS_DEFAULT}
            fill={hovered ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.06)'}
            stroke={WIRING_PREVIEW_COLOR}
            strokeWidth={hovered ? 2 : 1}
            dash={hovered ? undefined : [4, 3]}
            shadowColor={WIRING_PREVIEW_COLOR}
            shadowBlur={hovered ? 12 : 0}
            listening={false}
          />
          {hovered && (
            <>
              <Line points={[pin.x - 22, pin.y, pin.x - 14, pin.y]} stroke={WIRING_PREVIEW_COLOR} strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x + 14, pin.y, pin.x + 22, pin.y]} stroke={WIRING_PREVIEW_COLOR} strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x, pin.y - 22, pin.x, pin.y - 14]} stroke={WIRING_PREVIEW_COLOR} strokeWidth={1} opacity={0.5} listening={false} />
              <Line points={[pin.x, pin.y + 14, pin.x, pin.y + 22]} stroke={WIRING_PREVIEW_COLOR} strokeWidth={1} opacity={0.5} listening={false} />
            </>
          )}
        </>
      )}

      {/* Type glow ring on source node */}
      {isWiring && !isValidTarget && wiringFromNodeId === nodeId && (
        <Circle
          x={pin.x}
          y={pin.y}
          radius={10}
          fill="rgba(96,165,250,0.12)"
          stroke={WIRING_SOURCE_HIGHLIGHT}
          strokeWidth={1.5}
          shadowColor={WIRING_SOURCE_HIGHLIGHT}
          shadowBlur={8}
          listening={false}
        />
      )}

      {/* Pin dot */}
      <Circle
        x={pin.x}
        y={pin.y}
        radius={hovered ? PIN_RADIUS_HOVERED : PIN_RADIUS_DEFAULT}
        fill={hovered ? (isValidTarget ? WIRING_PREVIEW_COLOR : WIRING_SOURCE_HIGHLIGHT) : pinColor}
        stroke={
          hovered
            ? isValidTarget
              ? WIRING_PREVIEW_COLOR
              : WIRING_SOURCE_HIGHLIGHT
            : isDark
              ? 'rgba(255,255,255,0.25)'
              : 'rgba(15,23,42,0.28)'
        }
        strokeWidth={1.5}
        // Konva treats even a transparent shadow color as an active shadow.
        // Disable it while idle to avoid a full-canvas buffer copy per pin.
        shadowEnabled={hovered}
        shadowColor={hovered ? glowColor : 'transparent'}
        shadowBlur={hovered ? 8 : 0}
        hitStrokeWidth={PIN_HIT_STROKE_WIDTH}
        onClick={(e: KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          if (isProbeMode) {
            onProbeToggle?.({ nodeId, pinId: pin.id, x: pin.x, y: pin.y });
            return;
          }
          if (readOnly) return;
          if (isWiring) {
            if (wiringFromNodeId === nodeId) return;
            finishWiring(nodeId, pin.id);
          } else {
            startWiring(nodeId, pin.id);
          }
        }}
        onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
          setHovered(true);
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'crosshair';
        }}
        onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
          setHovered(false);
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'default';
        }}
      />

      {/* Pin label */}
      {(!detailed && !hovered && !isWiring && !isProbeMode) || (node.type === 'BREADBOARD' && !hovered) ? null : (
        <Text
          text={pin.name}
          x={labelX}
          y={labelY}
          fontSize={8}
          rotation={rotation}
          width={labelWidth}
          align={labelAlign}
          fill={
            hovered
              ? isDark
                ? 'rgba(255,255,255,1)'
                : 'rgba(15,23,42,0.95)'
              : isWiring
                ? isDark
                  ? 'rgba(255,255,255,0.85)'
                  : 'rgba(15,23,42,0.82)'
                : isDark
                  ? 'rgba(255,255,255,0.48)'
                  : 'rgba(15,23,42,0.58)'
          }
          fontFamily="JetBrains Mono"
          fontStyle={hovered ? '700' : '400'}
          shadowColor="black"
          shadowBlur={4}
          listening={false}
        />
      )}

      {isProbeMode && hovered && <PinVoltageTooltip nodeId={nodeId} pin={pin} />}
    </Group>
  );
});

export default PinDot;
