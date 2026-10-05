import { memo, useState } from 'react';
import { Group, Circle, Line, Text, Rect } from 'react-konva';
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
  onHitGraphInvalidated?: () => void;
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
  onHitGraphInvalidated,
}: PinDotProps) {
  const [hovered, setHovered] = useState(false);
  const isValidTarget = isWiring && wiringFromNodeId !== nodeId;
  const { fill: pinColor, glow: glowColor } = resolvePinColors(pin.type);

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
          onHitGraphInvalidated?.();
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'crosshair';
        }}
        onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
          setHovered(false);
          onHitGraphInvalidated?.();
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = 'default';
        }}
      />

      {/* Pin tooltip — only revealed on hover, eliminating workspace visual clutter */}
      {hovered && !isProbeMode && (
        <Group
          x={pin.x}
          y={pin.y < 22 ? pin.y + 14 : pin.y - 22}
          listening={false}
        >
          <Rect
            x={-(Math.max(pin.name.length * 7 + 14, 28)) / 2}
            y={0}
            width={Math.max(pin.name.length * 7 + 14, 28)}
            height={18}
            cornerRadius={4}
            fill="#0f172a"
            stroke={isValidTarget ? WIRING_PREVIEW_COLOR : '#38bdf8'}
            strokeWidth={1}
            shadowColor="rgba(0,0,0,0.6)"
            shadowBlur={6}
            shadowOffset={{ x: 0, y: 2 }}
          />
          <Text
            text={pin.name}
            x={-(Math.max(pin.name.length * 7 + 14, 28)) / 2}
            y={3}
            width={Math.max(pin.name.length * 7 + 14, 28)}
            align="center"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
            fontStyle="600"
            fill="#f8fafc"
          />
        </Group>
      )}

      {isProbeMode && hovered && <PinVoltageTooltip nodeId={nodeId} pin={pin} />}
    </Group>
  );
});

export default PinDot;
